package com.autamedica.android.presentation.common

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper

/** Find the activity even if locale configuration wraps the Android Context. */
tailrec fun Context.findHostActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findHostActivity()
    else -> null
}
