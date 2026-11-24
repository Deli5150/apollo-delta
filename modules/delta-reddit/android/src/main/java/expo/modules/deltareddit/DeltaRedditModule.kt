package expo.modules.deltareddit

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.webkit.CookieManager
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

// Reddit without an API key, on Android (src/lib/reddit/mobile.ts): you sign in on reddit.com in
// a WebView; this module reads that session's cookies (httpOnly ones included, which the page
// itself can't see) and sends the app's requests with an account's cookies set explicitly. Its
// HTTP client has no cookie jar, so accounts never mix (React Native's own fetch shares one jar
// with the WebView).
class DeltaRedditModule : Module() {
  private val client: OkHttpClient by lazy {
    OkHttpClient.Builder()
      .connectTimeout(20, TimeUnit.SECONDS)
      .readTimeout(30, TimeUnit.SECONDS)
      .followRedirects(true)
      .followSslRedirects(true)
      .build()
  }

  /** Text shared to the app (Share → Apollo Delta) that the app hasn't taken yet. */
  private fun sharedText(intent: Intent?): String? =
    if (intent?.action == Intent.ACTION_SEND) intent.getStringExtra(Intent.EXTRA_TEXT) else null

  override fun definition() = ModuleDefinition {
    Name("DeltaReddit")

    // A Reddit link shared to the app while it's open (one shared to start it: takeSharedText).
    Events("onShare")

    OnNewIntent { intent ->
      sharedText(intent)?.let { sendEvent("onShare", mapOf("text" to it)) }
    }

    // What was shared to start the app, once.
    Function("takeSharedText") {
      val activity = appContext.currentActivity ?: return@Function null
      val text = sharedText(activity.intent)
      if (text != null) activity.intent = Intent(activity.intent).setAction(Intent.ACTION_MAIN)
      text
    }

    // The system page where Reddit links can be set to open here (Open by default → Add links);
    // Android won't do it by itself for an app that isn't Reddit's own.
    Function("openLinkSettings") {
      val context = appContext.reactContext ?: return@Function false
      val pkg = Uri.parse("package:${context.packageName}")
      val intent = if (Build.VERSION.SDK_INT >= 31) Intent(Settings.ACTION_APP_OPEN_BY_DEFAULT_SETTINGS, pkg) else Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg)
      context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      true
    }

    // The cookies the WebView holds for a URL, as a Cookie header ("a=1; b=2").
    Function("getCookies") { url: String ->
      CookieManager.getInstance().getCookie(url) ?: ""
    }

    // Signs the WebView out of everything, so the next sign-in starts fresh.
    AsyncFunction("clearCookies") { promise: Promise ->
      val manager = CookieManager.getInstance()
      manager.removeAllCookies {
        manager.flush()
        promise.resolve(true)
      }
    }

    // One HTTP request. Resolves with status, final URL, content type, body and rate-limit headers.
    AsyncFunction("request") { url: String, method: String, headers: Map<String, String>, body: String?, promise: Promise ->
      val builder = Request.Builder().url(url)
      for ((k, v) in headers) builder.header(k, v)
      val type = headers.entries.firstOrNull { it.key.equals("Content-Type", true) }?.value
      val payload = body?.toRequestBody(type?.toMediaTypeOrNull())
      builder.method(method, if (method == "GET" || method == "HEAD") null else (payload ?: ByteArray(0).toRequestBody(null)))
      client.newCall(builder.build()).enqueue(object : okhttp3.Callback {
        override fun onFailure(call: okhttp3.Call, e: IOException) {
          promise.resolve(mapOf("status" to 0, "error" to (e.message ?: "network error")))
        }

        override fun onResponse(call: okhttp3.Call, response: okhttp3.Response) {
          response.use {
            val text = try { it.body?.string() ?: "" } catch (e: IOException) { "" }
            promise.resolve(
              mapOf(
                "status" to it.code,
                "url" to it.request.url.toString(),
                "contentType" to (it.header("Content-Type") ?: ""),
                "body" to text,
                "remaining" to it.header("x-ratelimit-remaining"),
                "reset" to it.header("x-ratelimit-reset"),
                "used" to it.header("x-ratelimit-used")
              )
            )
          }
        }
      })
    }
  }
}
