package com.winassist.app

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer

/** تسجيل صوتي بضغطة صريحة؛ يُدمَّر المتعرِّف فور انتهاء التسجيل فلا يبقى الميكروفون يعمل. */
class Voice(private val ctx: Context) {
    private var rec: SpeechRecognizer? = null

    fun available() = SpeechRecognizer.isRecognitionAvailable(ctx)

    fun start(onText: (String) -> Unit, onError: (String) -> Unit, onEnd: () -> Unit) {
        stop()
        val r = SpeechRecognizer.createSpeechRecognizer(ctx)
        rec = r
        r.setRecognitionListener(object : RecognitionListener {
            override fun onResults(results: Bundle) {
                results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.let(onText)
                finish(onEnd)
            }
            override fun onError(error: Int) { onError("تعذر التعرف على الصوت (رمز $error)"); finish(onEnd) }
            override fun onReadyForSpeech(p: Bundle?) {}
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(v: Float) {}
            override fun onBufferReceived(b: ByteArray?) {}
            override fun onEndOfSpeech() {}
            override fun onPartialResults(p: Bundle?) {}
            override fun onEvent(t: Int, p: Bundle?) {}
        })
        r.startListening(Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ar-SA")
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
        })
    }

    private fun finish(onEnd: () -> Unit) { stop(); onEnd() }

    fun stop() {
        rec?.cancel(); rec?.destroy(); rec = null
    }
}
