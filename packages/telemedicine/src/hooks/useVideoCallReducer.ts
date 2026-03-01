import { useReducer, useRef, useCallback } from 'react'

export interface VideoCallState {
  callStatus: string
  isMuted: boolean
  isVideoOff: boolean
  callDuration: number
  showMediaPicker: boolean
  mediaError: string
}

export type VideoCallAction =
  | { type: 'SET_STATUS'; status: string }
  | { type: 'TOGGLE_MUTE'; enabled: boolean }
  | { type: 'TOGGLE_VIDEO'; enabled: boolean }
  | { type: 'TICK_DURATION' }
  | { type: 'RESET_DURATION' }
  | { type: 'SET_MEDIA_ERROR'; error: string }
  | { type: 'CLEAR_MEDIA_ERROR' }
  | { type: 'SHOW_MEDIA_PICKER' }
  | { type: 'HIDE_MEDIA_PICKER' }

function videoCallReducer(state: VideoCallState, action: VideoCallAction): VideoCallState {
  switch (action.type) {
    case 'SET_STATUS':
      return { ...state, callStatus: action.status }
    case 'TOGGLE_MUTE':
      return { ...state, isMuted: !action.enabled }
    case 'TOGGLE_VIDEO':
      return { ...state, isVideoOff: !action.enabled }
    case 'TICK_DURATION':
      return { ...state, callDuration: state.callDuration + 1 }
    case 'RESET_DURATION':
      return { ...state, callDuration: 0 }
    case 'SET_MEDIA_ERROR':
      return { ...state, mediaError: action.error }
    case 'CLEAR_MEDIA_ERROR':
      return { ...state, mediaError: '' }
    case 'SHOW_MEDIA_PICKER':
      return { ...state, showMediaPicker: true }
    case 'HIDE_MEDIA_PICKER':
      return { ...state, showMediaPicker: false }
    default:
      return state
  }
}

export interface UseVideoCallReducerReturn {
  state: VideoCallState
  dispatch: React.Dispatch<VideoCallAction>
  startTimer: () => void
  stopTimer: () => void
  formatDuration: (seconds: number) => string
}

export function useVideoCallReducer(initialStatus: string): UseVideoCallReducerReturn {
  const [state, dispatch] = useReducer(videoCallReducer, {
    callStatus: initialStatus,
    isMuted: false,
    isVideoOff: false,
    callDuration: 0,
    showMediaPicker: false,
    mediaError: '',
  })

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const startTimer = useCallback(() => {
    if (timerRef.current) return
    timerRef.current = setInterval(() => {
      dispatch({ type: 'TICK_DURATION' })
    }, 1000)
  }, [])

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    dispatch({ type: 'RESET_DURATION' })
  }, [])

  const formatDuration = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }, [])

  return { state, dispatch, startTimer, stopTimer, formatDuration }
}
