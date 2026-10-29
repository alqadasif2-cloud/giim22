package com.winassist.app

import android.content.ContentValues
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import android.widget.Toast
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private val Green = Color(0xFF2E7D32)
private val Red = Color(0xFFC62828)

@Composable
fun LoginScreen(vm: MainVm) {
    var server by remember { mutableStateOf(vm.server.ifEmpty { "http://192.168.0.169:8000" }) }
    var email by remember { mutableStateOf("") }
    var pass by remember { mutableStateOf("") }
    Column(
        Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)
            .statusBarsPadding().imePadding().padding(24.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Text("مساعد التحكم بويندوز", style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.onBackground)
        Text("سجّل الدخول للتحكم بكمبيوترك من الهاتف عبر Wi-Fi أو الإنترنت", color = MaterialTheme.colorScheme.onSurfaceVariant)
        OutlinedTextField(server, { server = it }, label = { Text("عنوان الخادم (http://192.168.0.169:8000 أو https://…)") },
            singleLine = true, modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri))
        
        Row(Modifier.fillMaxWidth().padding(top = 4.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = { vm.testConnection(server) }, enabled = !vm.testingConnection) {
                Text(if (vm.testingConnection) "جارٍ الفحص…" else "فحص الاتصال بالخادم")
            }
            if (vm.testResult.isNotEmpty()) {
                Text(
                    vm.testResult,
                    color = if (vm.testResult.startsWith("✓")) Green else Red,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }

        OutlinedTextField(email, { email = it }, label = { Text("البريد الإلكتروني") },
            singleLine = true, modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email))
        OutlinedTextField(pass, { pass = it }, label = { Text("كلمة المرور (8 أحرف على الأقل)") },
            singleLine = true, visualTransformation = PasswordVisualTransformation(),
            modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password))
        if (vm.authError.isNotEmpty()) Text(vm.authError, color = Red, modifier = Modifier.padding(top = 8.dp))
        Row(Modifier.padding(top = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = { vm.auth(false, server, email, pass) }, enabled = !vm.authBusy) { Text("دخول") }
            OutlinedButton(onClick = { vm.auth(true, server, email, pass) }, enabled = !vm.authBusy) { Text("إنشاء حساب") }
            if (vm.authBusy) CircularProgressIndicator(Modifier.padding(start = 8.dp))
        }
    }
}

@Composable
fun HomeScreen(vm: MainVm, listening: Boolean, onMic: () -> Unit) {
    var showSettings by remember { mutableStateOf(false) }
    val listState = rememberLazyListState()
    LaunchedEffect(vm.items.size) { if (vm.items.isNotEmpty()) listState.animateScrollToItem(vm.items.size - 1) }
    val ready = vm.wsConnected && vm.pcOnline

    Column(
        Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)
            .statusBarsPadding().navigationBarsPadding().imePadding().padding(12.dp),
    ) {
        // الرأس + الحالة
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("مساعد ويندوز", style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.onBackground)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.padding(end = 6.dp).clip(RoundedCornerShape(50)).background(if (ready) Green else Red).padding(5.dp))
                    Text(vm.statusLabel, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            TextButton(onClick = { showSettings = true }) { Text("الإعدادات") }
        }

        // واجهة البث المباشر: تظهر فقط عندما يكون البث فعليا قيد التشغيل
        if (vm.sharing) {
            Card(Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
                Column(Modifier.padding(8.dp)) {
                    Text("🔴 مشاركة الشاشة نشطة", color = Red)
                    val f = vm.liveFrame
                    if (f != null) Image(f.asImageBitmap(), "شاشة الكمبيوتر",
                        Modifier.fillMaxWidth().heightIn(max = 260.dp), contentScale = ContentScale.Fit)
                    else Text("بانتظار أول إطار…", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Button(onClick = { vm.stopShare() }, colors = ButtonDefaults.buttonColors(containerColor = Red),
                        modifier = Modifier.fillMaxWidth().padding(top = 6.dp)) { Text("إيقاف مشاركة الشاشة") }
                }
            }
        }

        // السجل
        LazyColumn(Modifier.weight(1f).fillMaxWidth(), state = listState, verticalArrangement = Arrangement.spacedBy(6.dp)) {
            items(vm.items, key = { it.id }) { ChatBubble(it) }
        }

        if (vm.activeTask != null) {
            Text(vm.progress, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp))
            LinearProgressIndicator(Modifier.fillMaxWidth().padding(vertical = 4.dp))
        }

        // أزرار التحكم (كلها يدوية، لا شيء يعمل تلقائيا)
        Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            OutlinedButton(onClick = { vm.cancelTask() }, enabled = vm.activeTask != null, modifier = Modifier.weight(1f)) { Text("إيقاف المهمة") }
            OutlinedButton(onClick = { vm.analyzeScreen() }, enabled = ready && vm.activeTask == null, modifier = Modifier.weight(1f)) { Text("تحليل الشاشة") }
        }
        Row(Modifier.fillMaxWidth().padding(bottom = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            OutlinedButton(onClick = { vm.screenshotOnly() }, enabled = ready && vm.activeTask == null, modifier = Modifier.weight(1f)) { Text("لقطة شاشة") }
            OutlinedButton(onClick = { vm.startShare() }, enabled = ready && !vm.sharing && !vm.shareRequested, modifier = Modifier.weight(1f)) { Text("بدء مشاركة الشاشة") }
        }

        // الإدخال
        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(vm.input, { vm.input = it }, modifier = Modifier.weight(1f),
                placeholder = { Text(if (listening) "جارٍ الاستماع…" else "اكتب أمرك…") }, maxLines = 3)
            TextButton(onClick = onMic) { Text(if (listening) "⏹" else "🎤") }
            Button(onClick = { vm.sendCommand() }, enabled = ready && vm.activeTask == null && vm.input.isNotBlank()) { Text("إرسال") }
        }
    }

    // طلب التأكيد قبل الإجراءات الحساسة
    vm.confirm?.let { c ->
        AlertDialog(
            onDismissRequest = {},
            title = { Text("يلزم تأكيدك") },
            text = { Text("الإجراء: ${actionName(c.action)}\n${c.detail}") },
            confirmButton = { Button(onClick = { vm.answerConfirm(true) }) { Text("نعم، نفّذ") } },
            dismissButton = { TextButton(onClick = { vm.answerConfirm(false) }) { Text("إلغاء") } },
        )
    }

    if (showSettings) SettingsDialog(vm) { showSettings = false }
}

private fun actionName(a: String) = when (a) {
    "delete_path" -> "حذف ملف/مجلد (إلى سلة المحذوفات)"
    else -> a
}

@Composable
private fun ChatBubble(item: ChatItem) {
    val ctx = LocalContext.current
    val (bg, fg) = when (item.kind) {
        Kind.USER -> MaterialTheme.colorScheme.primaryContainer to MaterialTheme.colorScheme.onPrimaryContainer
        Kind.ERROR -> Color(0xFF4E1A1A) to Color.White
        else -> MaterialTheme.colorScheme.surfaceVariant to MaterialTheme.colorScheme.onSurfaceVariant
    }
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(bg).padding(10.dp)) {
        if (item.kind == Kind.IMAGE && item.imageB64 != null) {
            val bmp by produceState<Bitmap?>(null, item.imageB64) {
                value = withContext(Dispatchers.Default) {
                    val b = Base64.decode(item.imageB64, Base64.DEFAULT)
                    BitmapFactory.decodeByteArray(b, 0, b.size)
                }
            }
            bmp?.let { Image(it.asImageBitmap(), "لقطة الشاشة", Modifier.fillMaxWidth(), contentScale = ContentScale.FillWidth) }
            if (item.text.isNotBlank()) Text(item.text, color = fg, modifier = Modifier.padding(top = 6.dp))
            TextButton(onClick = {
                val ok = bmp?.let { saveToGallery(ctx, it) } ?: false
                Toast.makeText(ctx, if (ok) "تم الحفظ في الصور" else "تعذر الحفظ", Toast.LENGTH_SHORT).show()
            }) { Text("حفظ الصورة على الهاتف") }
        } else {
            Text(item.text, color = fg)
        }
    }
}

private fun saveToGallery(ctx: android.content.Context, bmp: Bitmap): Boolean = try {
    val values = ContentValues().apply {
        put(MediaStore.Images.Media.DISPLAY_NAME, "pc_screen_${System.currentTimeMillis()}.jpg")
        put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg")
        put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/WinAssistant")
    }
    val uri = ctx.contentResolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values)!!
    ctx.contentResolver.openOutputStream(uri)!!.use { bmp.compress(Bitmap.CompressFormat.JPEG, 90, it) }
    true
} catch (e: Exception) { false }

@Composable
private fun SettingsDialog(vm: MainVm, onClose: () -> Unit) {
    AlertDialog(
        onDismissRequest = onClose,
        title = { Text("الإعدادات والخصوصية") },
        text = {
            Column {
                Text("الخادم: ${vm.server}")
                Text("البيانات المستلمة في هذه الجلسة: ${rxBytes.get() / 1024} كيلوبايت", modifier = Modifier.padding(top = 6.dp))
                Text("الصور والبث لا تُرسل ولا تُلتقط إلا عند ضغطك على أزرارها.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 6.dp))
                Text("لربط كمبيوتر جديد: اضغط الزر ثم شغّل في Windows الأمر pair بالرمز (صالح 5 دقائق).",
                    modifier = Modifier.padding(top = 10.dp))
                if (vm.pairCode.isNotEmpty())
                    Text(vm.pairCode, style = MaterialTheme.typography.headlineMedium, modifier = Modifier.padding(top = 6.dp))
                OutlinedButton(onClick = { vm.requestPairCode() }, modifier = Modifier.padding(top = 6.dp)) { Text("إنشاء رمز ربط") }
            }
        },
        confirmButton = { TextButton(onClick = onClose) { Text("إغلاق") } },
        dismissButton = { TextButton(onClick = { vm.logout(); onClose() }) { Text("تسجيل الخروج") } },
    )
}
