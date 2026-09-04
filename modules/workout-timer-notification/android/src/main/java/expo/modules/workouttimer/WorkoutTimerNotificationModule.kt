package expo.modules.workouttimer

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class WorkoutTimerNotificationModule : Module() {
  private companion object {
    const val CHANNEL_ID = "workout-timer"
    const val NOTIFICATION_ID = 73421
  }

  override fun definition() = ModuleDefinition {
    Name("WorkoutTimerNotification")

    Function("start") { startedAt: Double, workoutName: String ->
      val context = requireNotNull(appContext.reactContext)
      createChannel(context)

      val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
        ?.apply {
          flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
      val contentIntent = launchIntent?.let {
        PendingIntent.getActivity(
          context,
          0,
          it,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
      }
      val notificationIcon = context.resources.getIdentifier(
        "notification_icon",
        "drawable",
        context.packageName
      ).takeIf { it != 0 } ?: context.applicationInfo.icon
      val notification = NotificationCompat.Builder(context, CHANNEL_ID)
        .setSmallIcon(notificationIcon)
        .setContentTitle("Chronomètre")
        .setContentText(workoutName.ifBlank { "Séance en cours" })
        .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
        .setPriority(NotificationCompat.PRIORITY_LOW)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setOnlyAlertOnce(true)
        .setOngoing(true)
        .setShowWhen(true)
        .setWhen(startedAt.toLong())
        .setUsesChronometer(true)
        .setChronometerCountDown(false)
        .apply { contentIntent?.let(::setContentIntent) }
        .build()
        .apply {
          // Android 16+ peut ainsi présenter le chrono en Live Update sur
          // l'écran verrouillé et dans la puce de la barre d'état. La clé est
          // ignorée sans effet sur les versions antérieures.
          extras.putBoolean("android.requestPromotedOngoing", true)
        }

      NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification)
    }

    Function("stop") {
      val context = requireNotNull(appContext.reactContext)
      NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)
    }
  }

  private fun createChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java)
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Chronomètre de séance",
      NotificationManager.IMPORTANCE_LOW
    ).apply {
      description = "Affiche le chronomètre pendant une séance"
      lockscreenVisibility = NotificationCompat.VISIBILITY_PUBLIC
      setShowBadge(false)
      setSound(null, null)
      enableVibration(false)
    }
    manager.createNotificationChannel(channel)
  }
}
