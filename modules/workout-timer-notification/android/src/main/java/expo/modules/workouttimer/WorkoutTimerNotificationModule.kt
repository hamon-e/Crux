package expo.modules.workouttimer

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.SystemClock
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class WorkoutTimerNotificationModule : Module() {
  private companion object {
    // Un nouvel identifiant est nécessaire : Android conserve l'importance
    // initiale d'un canal et continuait donc de classer l'ancien comme silencieux.
    const val CHANNEL_ID = "workout-timer-v2"
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
      val elapsedRealtime = (System.currentTimeMillis() - startedAt.toLong()).coerceAtLeast(0L)
      val chronometerBase = SystemClock.elapsedRealtime() - elapsedRealtime
      val contentView = RemoteViews(
        context.packageName,
        R.layout.workout_timer_notification
      ).apply {
        setTextViewText(
          R.id.workout_timer_name,
          workoutName.ifBlank { "Séance en cours" }
        )
        setChronometer(R.id.workout_timer_chronometer, chronometerBase, null, true)
      }

      val notification = NotificationCompat.Builder(context, CHANNEL_ID)
        .setSmallIcon(R.drawable.ic_workout_timer)
        .setContentTitle("Chronomètre")
        .setContentText(workoutName.ifBlank { "Séance en cours" })
        .setCustomContentView(contentView)
        .setCustomBigContentView(contentView)
        .setStyle(NotificationCompat.DecoratedCustomViewStyle())
        .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
        .setPriority(NotificationCompat.PRIORITY_HIGH)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setOnlyAlertOnce(true)
        .setOngoing(true)
        .setLocalOnly(true)
        .setShowWhen(true)
        .setWhen(startedAt.toLong())
        // Laisser Android exposer le temps dans ses présentations compactes
        // (barre d'état et écran verrouillé), en complément de notre vue.
        .setUsesChronometer(true)
        .setChronometerCountDown(false)
        .apply { contentIntent?.let(::setContentIntent) }
        .build()

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
      NotificationManager.IMPORTANCE_DEFAULT
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
