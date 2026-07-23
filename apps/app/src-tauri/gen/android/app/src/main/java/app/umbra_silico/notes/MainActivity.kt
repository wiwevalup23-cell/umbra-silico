package app.umbra_silico.notes

import android.graphics.Color
import android.os.Bundle
import android.view.View
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    val lightSystemBarStyle = SystemBarStyle.light(
      Color.TRANSPARENT,
      Color.argb(32, 0, 0, 0),
    )

    enableEdgeToEdge(
      statusBarStyle = lightSystemBarStyle,
      navigationBarStyle = lightSystemBarStyle,
    )
    super.onCreate(savedInstanceState)

    val contentView = findViewById<View>(android.R.id.content)
    contentView.setBackgroundColor(Color.rgb(248, 245, 237))

    ViewCompat.setOnApplyWindowInsetsListener(contentView) { view, windowInsets ->
      val safeInsets = windowInsets.getInsets(
        WindowInsetsCompat.Type.systemBars() or
          WindowInsetsCompat.Type.displayCutout(),
      )

      view.setPadding(
        safeInsets.left,
        safeInsets.top,
        safeInsets.right,
        safeInsets.bottom,
      )

      WindowInsetsCompat.CONSUMED
    }

    WindowCompat.getInsetsController(window, contentView).apply {
      isAppearanceLightStatusBars = true
      isAppearanceLightNavigationBars = true
    }
    ViewCompat.requestApplyInsets(contentView)
  }
}
