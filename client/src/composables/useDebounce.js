import { ref, watch } from 'vue'

/**
 * Returns a debounced version of a callback.
 * @param {Function} fn   - function to debounce
 * @param {number}   wait - delay in ms (default 50)
 */
export function useDebounce(fn, wait = 50) {
  let timer = null
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), wait)
  }
}

/**
 * Watches a ref and calls fn debounced whenever it changes.
 * Returns a cancel function.
 */
export function watchDebounced(source, fn, wait = 50) {
  let timer = null
  const stop = watch(source, (val) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(val), wait)
  })
  return () => { clearTimeout(timer); stop() }
}
