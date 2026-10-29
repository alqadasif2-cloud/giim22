package com.winassist.app

import android.app.Application
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Base64
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.util.UUID

enum class Kind { USER, STATUS, RESULT, ERROR, IMAGE }

data class ChatItem(
    val id: String = UUID.randomUUID().toString(),
    val kind: Kind,
    val text: String,
    val imageB64: String? = null,
)

data class Confirm(val taskId: String, val action: String, val detail: String)

class MainVm(app: Application) : AndroidViewModel(app) {
    private val store = Store(app)
    private var socket: PhoneSocket? = null
    private var connectJob: Job? = null
    private var pingJob: Job? = null

    var loggedIn by mutableStateOf(store.token.isNotEmpty())
    var server by mutableStateOf(store.server)
    var wsConnected by mutableStateOf(false)
    var pcOnline by mutableStateOf(false)
    var items by mutableStateOf(listOf<ChatItem>())
    var activeTask by mutableStateOf<String?>(null)     // مهمة تنفيذ/تحليل جارية
    var analyzing by mutableStateOf(false)
    var progress by mutableStateOf("")
    var sharing by mutableStateOf(false)                // true فقط بعد تأكيد الوكيل أن البث بدأ فعلا
    var shareRequested by mutableStateOf(false)
    var liveFrame by mutableStateOf<Bitmap?>(null)
    var confirm by mutableStateOf<Confirm?>(null)
    var authError by mutableStateOf("")
    var authBusy by mutableStateOf(false)
    var testResult by mutableStateOf("")
    var testingConnection by mutableStateOf(false)
    var pairCode by mutableStateOf("")
    var input by mutableStateOf("")

    val statusLabel: String
        get() = when {
            !wsConnected -> "غير متصل بالخادم"
            !pcOnline -> "الكمبيوتر غير متصل"
            sharing -> "مشاركة الشاشة نشطة"
            confirm != null -> "يحتاج إلى تأكيد"
            analyzing -> "تحليل الشاشة بطلب المستخدم"
            activeTask != null -> "تنفيذ المهمة"
            else -> "خامل — بانتظار أمر"
        }

    init { if (loggedIn) startConnection() }

    // ---------------- فحص الاتصال ----------------
    fun testConnection(serverUrl: String) {
        val url = serverUrl.trim().trimEnd('/')
        if (url.isEmpty()) { testResult = "أدخل عنوان الخادم أولاً"; return }
        testingConnection = true
        testResult = "جارٍ فحص الاتصال بالخادم..."
        viewModelScope.launch {
            try {
                val j = apiGet(url, "/health")
                testResult = if (j.optBoolean("ok", false)) "✓ الاتصال بالخادم ناجح (200 OK)"
                             else "✓ استجاب الخادم بنجاح"
            } catch (e: Exception) {
                testResult = "✗ تعذر الوصول إلى الخادم: ${e.message}"
            }
            testingConnection = false
        }
    }

    // ---------------- الحساب ----------------
    fun auth(register: Boolean, serverUrl: String, email: String, password: String) {
        val url = serverUrl.trim().trimEnd('/')
        val isLocal = url.startsWith("http://192.168.") ||
                      url.startsWith("http://10.") ||
                      url.startsWith("http://172.") ||
                      url.startsWith("http://127.0.0.1") ||
                      url.startsWith("http://localhost") ||
                      url.startsWith("http://10.0.2.2")
        if (!url.startsWith("https://") && !isLocal) {
            authError = "يجب استخدام https:// للخوادم العامة أو http:// للشبكة المحلية (192.168.x.x)"
            return
        }
        authBusy = true; authError = ""
        viewModelScope.launch {
            try {
                val j = apiPost(url, if (register) "/auth/register" else "/auth/login",
                    JSONObject().put("email", email.trim()).put("password", password))
                store.server = url; store.token = j.getString("token")
                server = url; loggedIn = true
                startConnection()
            } catch (e: ApiException) { authError = e.message ?: "فشل" }
            authBusy = false
        }
    }

    fun logout() {
        stopConnection(); store.logout(); loggedIn = false; items = emptyList(); pairCode = ""
    }

    fun requestPairCode() {
        viewModelScope.launch {
            try {
                val j = apiPost(server, "/devices/pair-code", token = store.token)
                pairCode = j.getString("code")
            } catch (e: ApiException) { add(Kind.ERROR, e.message ?: "فشل") }
        }
    }

    // ---------------- الاتصال ----------------
    private fun startConnection() {
        stopConnection()
        connectJob = viewModelScope.launch {
            var delayMs = 1000L
            while (loggedIn) {
                var closedReason: String? = null
                val s = PhoneSocket(server, store.token,
                    onMessage = { m -> viewModelScope.launch { handle(m) } },
                    onClosed = { r -> closedReason = r })
                socket = s
                s.connect()
                delay(2000)
                if (closedReason == null && wsConnected) delayMs = 1000L   // الاتصال نجح فعلا
                while (closedReason == null && loggedIn) delay(500)
                wsConnected = false; pcOnline = false; resetVisualState()
                if (closedReason == "auth") { logout(); authError = "انتهت الجلسة، سجّل الدخول من جديد"; return@launch }
                delay(delayMs)
                delayMs = minOf(delayMs * 2, 60_000L)    // إعادة اتصال متدرجة
            }
        }
        pingJob = viewModelScope.launch {
            while (true) { delay(25_000); socket?.send(JSONObject().put("type", "ping")) }
        }
    }

    private fun stopConnection() {
        connectJob?.cancel(); pingJob?.cancel()
        socket?.close(); socket = null
        wsConnected = false; pcOnline = false; resetVisualState()
    }

    private fun resetVisualState() {
        sharing = false; shareRequested = false; liveFrame = null
        analyzing = false; activeTask = null; progress = ""; confirm = null
    }

    // ---------------- الإرسال ----------------
    private fun add(kind: Kind, text: String, img: String? = null) {
        items = items + ChatItem(kind = kind, text = text, imageB64 = img)
    }

    private fun send(obj: JSONObject): Boolean {
        val ok = socket?.send(obj) ?: false
        if (!ok) add(Kind.ERROR, "تعذر الإرسال: لا يوجد اتصال")
        return ok
    }

    fun sendCommand() {
        val text = input.trim()
        if (text.isEmpty() || activeTask != null) return
        val tid = UUID.randomUUID().toString()
        add(Kind.USER, text)
        if (send(JSONObject().put("type", "command").put("task_id", tid).put("text", text))) {
            activeTask = tid; input = ""; progress = "جارٍ فهم الأمر…"
        }
    }

    fun analyzeScreen() {
        if (activeTask != null) return
        val tid = UUID.randomUUID().toString()
        add(Kind.USER, "تحليل الشاشة الحالية")
        if (send(JSONObject().put("type", "analyze_screen").put("task_id", tid))) {
            activeTask = tid; analyzing = true; progress = "جارٍ التقاط الشاشة…"
        }
    }

    fun screenshotOnly() {
        if (activeTask != null) return
        val tid = UUID.randomUUID().toString()
        add(Kind.USER, "لقطة للشاشة")
        if (send(JSONObject().put("type", "screenshot").put("task_id", tid))) {
            activeTask = tid; progress = "جارٍ التقاط الشاشة…"
        }
    }

    fun startShare() {
        if (shareRequested || sharing) return
        shareRequested = true
        if (!send(JSONObject().put("type", "share_start").put("task_id", UUID.randomUUID().toString())
                .put("max_seconds", 600))) shareRequested = false
    }

    fun stopShare() {
        send(JSONObject().put("type", "share_stop"))
        // إخفاء الواجهة فورا؛ الحالة النهائية تأتي من الوكيل
        sharing = false; shareRequested = false; liveFrame = null
    }

    fun cancelTask() {
        val tid = activeTask ?: return
        send(JSONObject().put("type", "cancel").put("task_id", tid))
        add(Kind.STATUS, "طُلب إيقاف المهمة…")
        confirm = null
    }

    fun answerConfirm(approve: Boolean) {
        val c = confirm ?: return
        send(JSONObject().put("type", "confirm").put("task_id", c.taskId).put("approve", approve))
        confirm = null
    }

    // ---------------- الاستقبال ----------------
    private suspend fun handle(m: JSONObject) {
        when (m.optString("type")) {
            "pc_status" -> {
                wsConnected = true            // أول رد من الخادم = اتصال ومصادقة ناجحان
                pcOnline = m.optBoolean("online")
                if (!pcOnline) resetVisualState()
            }
            "stage" -> progress = if (m.optString("stage") == "planning") "جارٍ فهم الأمر…" else "جارٍ التنفيذ…"
            "progress" -> progress = "الخطوة ${m.optInt("step")}/${m.optInt("total")}: ${m.optString("note")}"
            "clarify" -> { activeTask = null; progress = ""; add(Kind.STATUS, "❓ " + m.optString("question")) }
            "confirm_request" -> confirm = Confirm(m.optString("task_id"), m.optString("action"), m.optString("detail"))
            "screenshot" -> {
                val b64 = m.optString("jpeg")
                val analysis = m.optString("analysis")
                add(Kind.IMAGE, analysis, b64)
            }
            "task_done" -> finish(Kind.RESULT, "✅ " + m.optString("summary").ifEmpty { "تم" })
            "task_cancelled" -> finish(Kind.STATUS, "⏹ " + m.optString("summary"))
            "task_failed" -> finish(Kind.ERROR, "⚠️ " + m.optString("error"))
            "share_started" -> { shareRequested = false; sharing = true }
            "share_stopped" -> { sharing = false; shareRequested = false; liveFrame = null }
            "frame" -> {
                if (!sharing) return
                val bmp = withContext(Dispatchers.Default) {
                    val bytes = Base64.decode(m.optString("jpeg"), Base64.DEFAULT)
                    BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                }
                if (sharing) liveFrame = bmp
            }
        }
    }

    private fun finish(kind: Kind, text: String) {
        add(kind, text)
        activeTask = null; analyzing = false; progress = ""; confirm = null
    }
}
