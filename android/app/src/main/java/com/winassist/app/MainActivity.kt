package com.winassist.app

import android.Manifest
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection

class MainActivity : ComponentActivity() {
    private val vm: MainVm by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                MaterialTheme(colorScheme = darkColorScheme()) {
                    Root(vm)
                }
            }
        }
    }
}

@Composable
private fun Root(vm: MainVm) {
    val ctx = LocalContext.current
    val voice = remember { Voice(ctx) }
    var listening by remember { mutableStateOf(false) }
    DisposableEffect(Unit) { onDispose { voice.stop() } }

    fun startListening() {
        if (!voice.available()) {
            Toast.makeText(ctx, "خدمة التعرف على الكلام غير متوفرة على هذا الجهاز", Toast.LENGTH_LONG).show()
            return
        }
        listening = true
        voice.start(
            onText = { vm.input = it },                       // يُعرض النص قبل الإرسال
            onError = { Toast.makeText(ctx, it, Toast.LENGTH_SHORT).show() },
            onEnd = { listening = false },
        )
    }

    val micPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) startListening()
    }

    if (!vm.loggedIn) {
        LoginScreen(vm)
    } else {
        HomeScreen(
            vm = vm,
            listening = listening,
            onMic = {
                if (listening) { voice.stop(); listening = false }
                else micPermission.launch(Manifest.permission.RECORD_AUDIO)
            },
        )
    }
}
