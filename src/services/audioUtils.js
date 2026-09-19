const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export function uint8ArrayToBase64(arr) {
  const len = arr.length
  let result = ''
  let i = 0
  while (i < len) {
    const byte1 = arr[i++]
    const byte2 = i < len ? arr[i++] : 0
    const byte3 = i < len ? arr[i++] : 0
    result += BASE64_CHARS[byte1 >> 2]
    result += BASE64_CHARS[((byte1 & 3) << 4) | (byte2 >> 4)]
    result += BASE64_CHARS[((byte2 & 15) << 2) | (byte3 >> 6)]
    result += BASE64_CHARS[byte3 & 63]
  }
  const padding = len % 3
  if (padding > 0) {
    result = result.slice(0, -padding) + '==='.slice(0, padding)
  }
  return result
}

export function float32ToInt16(float32Array) {
  const int16Array = new Int16Array(float32Array.length)
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]))
    int16Array[i] = s < 0 ? s * 32768 : s * 32767
  }
  return int16Array
}

export function float32ToInt16Bytes(float32Array) {
  const int16Array = float32ToInt16(float32Array)
  return new Uint8Array(int16Array.buffer)
}

export async function decodeAudioToPCM(audioBlob, targetSampleRate = 16000) {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)()
  
  try {
    const arrayBuffer = await audioBlob.arrayBuffer()
    const decodedBuffer = await audioContext.decodeAudioData(arrayBuffer)
    
    const sampleRate = decodedBuffer.sampleRate
    const numberOfChannels = decodedBuffer.numberOfChannels
    const length = decodedBuffer.length
    
    let audioBuffer = decodedBuffer
    
    if (numberOfChannels > 1) {
      const downmixed = audioContext.createBuffer(1, length, sampleRate)
      const dest = downmixed.getChannelData(0)
      for (let i = 0; i < numberOfChannels; i++) {
        const src = decodedBuffer.getChannelData(i)
        for (let j = 0; j < length; j++) {
          dest[j] += src[j] / numberOfChannels
        }
      }
      audioBuffer = downmixed
    }
    
    let finalBuffer = audioBuffer
    
    if (sampleRate !== targetSampleRate) {
      const ratio = targetSampleRate / sampleRate
      const newLength = Math.floor(length * ratio)
      const resampled = audioContext.createBuffer(1, newLength, targetSampleRate)
      const srcData = audioBuffer.getChannelData(0)
      const destData = resampled.getChannelData(0)
      
      for (let i = 0; i < newLength; i++) {
        const srcIndex = i / ratio
        const floorIndex = Math.floor(srcIndex)
        const ceilIndex = Math.min(floorIndex + 1, length - 1)
        const t = srcIndex - floorIndex
        destData[i] = srcData[floorIndex] * (1 - t) + srcData[ceilIndex] * t
      }
      finalBuffer = resampled
    }
    
    const channelData = finalBuffer.getChannelData(0)
    return float32ToInt16(channelData)
    
  } finally {
    try { audioContext.close() } catch (_) {}
  }
}

export function createAudioStreamRecorder(onData) {
  let audioContext = null
  let mediaStream = null
  let source = null
  let processor = null
  let isRunning = false
  let sampleRate = 16000
  
  const start = async (stream, targetSampleRate = 16000) => {
    if (isRunning) return
    
    sampleRate = targetSampleRate
    audioContext = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: targetSampleRate,
    })
    
    mediaStream = stream
    source = audioContext.createMediaStreamSource(stream)
    
    const bufferSize = Math.max(256, Math.floor(targetSampleRate / 10))
    processor = audioContext.createScriptProcessor(bufferSize, 1, 1)
    
    processor.onaudioprocess = (e) => {
      if (!isRunning) return
      const inputBuffer = e.inputBuffer
      const channelData = inputBuffer.getChannelData(0)
      const pcmData = float32ToInt16(channelData)
      if (typeof onData === 'function') {
        onData(pcmData)
      }
    }
    
    source.connect(processor)
    processor.connect(audioContext.destination)
    isRunning = true
  }
  
  const stop = () => {
    isRunning = false
    try {
      if (processor) {
        processor.disconnect()
        processor.onaudioprocess = null
        processor = null
      }
    } catch (_) {}
    try {
      if (source) {
        source.disconnect()
        source = null
      }
    } catch (_) {}
    try {
      if (audioContext) {
        audioContext.close()
        audioContext = null
      }
    } catch (_) {}
  }
  
  return { start, stop }
}

export async function getMicrophoneStream() {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: 16000,
    },
  })
}

export function calculateAudioLevel(pcmData) {
  if (!pcmData || pcmData.length === 0) return 0
  
  let sum = 0
  const length = pcmData.length
  
  for (let i = 0; i < length; i++) {
    const sample = pcmData[i] / 32768
    sum += sample * sample
  }
  
  const rms = Math.sqrt(sum / length)
  const normalized = Math.min(1, rms * 3)
  
  return normalized
}