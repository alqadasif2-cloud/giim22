package com.winassist.app

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong

class ApiException(message: String) : Exception(message)

private val rest = OkHttpClient.Builder()
    .connectTimeout(15, TimeUnit.SECONDS)
    .readTimeout(20, TimeUnit.SECONDS)
    .build()

private val wsClient = OkHttpClient.Builder()
    .connectTimeout(15, TimeUnit.SECONDS)
    .readTimeout(0, TimeUnit.MILLISECONDS)
    .build()

/** عدّاد تقريبي لحجم البيانات المستلمة (لعرض استهلاك الإنترنت). */
val rxBytes = AtomicLong(0)

suspend fun apiPost(base: String, path: String, body: JSONObject? = null, token: String? = null): JSONObject =
    withContext(Dispatchers.IO) {
        val req = Request.Builder()
            .url(base.trimEnd('/') + path)
            .post((body?.toString() ?: "{}").toRequestBody("application/json".toMediaType()))
            .apply { if (token != null) header("Authorization", "Bearer $token") }
            .build()
        try {
            rest.newCall(req).execute().use { r: Response ->
                val txt = r.body?.string() ?: "{}"
                val j = try { JSONObject(txt) } catch (e: Exception) { JSONObject() }
                if (!r.isSuccessful) throw ApiException(j.optString("detail", "خطأ من الخادم (${r.code})"))
                j
            }
        } catch (e: ApiException) {
            throw e
        } catch (e: Exception) {
            throw ApiException("تعذر الوصول إلى الخادم: ${e.message}")
        }
    }

class PhoneSocket(
    private val base: String,
    private val token: String,
    private val onMessage: (JSONObject) -> Unit,
    private val onClosed: (String) -> Unit,
) {
    private var ws: WebSocket? = null
    @Volatile private var closedByUs = false

    fun connect() {
        val url = base.trimEnd('/')
            .replaceFirst("https://", "wss://")
            .replaceFirst("http://", "ws://") + "/ws/phone"
        ws = wsClient.newWebSocket(Request.Builder().url(url).build(), object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                webSocket.send(JSONObject().put("token", token).toString())
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                rxBytes.addAndGet(text.length.toLong())
                try { onMessage(JSONObject(text)) } catch (_: Exception) { }
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                if (!closedByUs) onClosed(if (code == 4401) "auth" else "closed")
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                if (!closedByUs) onClosed("failure")
            }
        })
    }

    fun send(obj: JSONObject): Boolean = ws?.send(obj.toString()) ?: false

    fun close() {
        closedByUs = true
        ws?.close(1000, null)
        ws = null
    }
}
