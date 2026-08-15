/**
 * The screenshots of the commercial page.
 *
 * It drives Chromium over its debugging protocol, with no browser-automation
 * dependency: node brings a WebSocket client and the protocol is JSON. One less
 * package to keep for something that runs by hand every few months.
 *
 * The session is planted in `localStorage` instead of going through the login
 * form, because what is being photographed is the catalogue and not the door, and
 * a form filled in by a script is one more thing that can break without the image
 * saying so.
 *
 *     node capture.mjs <dist> <images> <output-directory>
 */

import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { start, session, unanswered } from './server.mjs'

const [, , DIST, IMAGES, OUT = 'shots'] = process.argv
const PORT = 5799
const ORIGIN = `http://localhost:${PORT}`
const CHROME = process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'

/** A phone, which is the main device, and a laptop. */
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }
const DESKTOP = { width: 1280, height: 800, deviceScaleFactor: 2, mobile: false }

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Presses the button whose label starts with this text. */
const clickText = (text) =>
  `[...document.querySelectorAll('button,a')].find((e) => e.textContent.trim().startsWith(${JSON.stringify(
    text,
  )}))?.click()`

/** Leaves that heading at the top of the screen. */
const scrollToText = (text) =>
  `[...document.querySelectorAll('h2,h3')].find((e) => e.textContent.trim().startsWith(${JSON.stringify(
    text,
  )}))?.scrollIntoView({block: 'start'})`

class Chromium {
  #socket
  #pending = new Map()
  #next = 1

  static async launch() {
    const chrome = spawn(CHROME, [
      '--headless=new',
      '--remote-debugging-port=9333',
      '--no-sandbox',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-color-profile=srgb',
      '--disable-lcd-text',
      '--window-size=1280,900',
      'about:blank',
    ])
    chrome.stderr.on('data', () => {})

    let target = null
    for (let attempt = 0; attempt < 60 && target === null; attempt += 1) {
      await sleep(250)
      try {
        const list = await fetch('http://localhost:9333/json/list').then((r) => r.json())
        target = list.find((t) => t.type === 'page') ?? null
      } catch {
        // Not up yet.
      }
    }
    if (target === null) throw new Error('Chromium no ha arrancado')

    const browser = new Chromium()
    await browser.#connect(target.webSocketDebuggerUrl)
    browser.process = chrome
    return browser
  }

  #connect(url) {
    return new Promise((resolve, reject) => {
      this.#socket = new WebSocket(url)
      this.#socket.addEventListener('open', () => resolve())
      this.#socket.addEventListener('error', reject)
      this.#socket.addEventListener('message', (event) => {
        const message = JSON.parse(event.data)
        const waiting = this.#pending.get(message.id)
        if (!waiting) return
        this.#pending.delete(message.id)
        if (message.error) waiting.reject(new Error(JSON.stringify(message.error)))
        else waiting.resolve(message.result)
      })
    })
  }

  send(method, params = {}) {
    const id = this.#next++
    this.#socket.send(JSON.stringify({ id, method, params }))
    return new Promise((resolve, reject) => this.#pending.set(id, { resolve, reject }))
  }

  async evaluate(expression) {
    const { result } = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })
    return result.value
  }

  async goto(path, { settle = 1500 } = {}) {
    await this.send('Page.navigate', { url: `${ORIGIN}${path}` })
    await sleep(settle)
    // The images are signed and fetched after painting: waiting for all of them
    // to be complete is the difference between a screenshot with photographs and
    // one with grey boxes.
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const ready = await this.evaluate(
        '[...document.images].every((i) => i.complete && i.naturalWidth > 0)',
      )
      if (ready) break
      await sleep(250)
    }
    await sleep(400)
  }

  async shot(file) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' })
    await writeFile(file, Buffer.from(data, 'base64'))
    console.log(`  ${file}`)
  }

  async device(metrics) {
    await this.send('Emulation.setDeviceMetricsOverride', { ...metrics, screenWidth: metrics.width })
  }

  close() {
    this.#socket.close()
    this.process.kill()
  }
}

async function main() {
  await mkdir(OUT, { recursive: true })
  const server = await start({ dist: DIST, images: IMAGES, port: PORT })
  const browser = await Chromium.launch()
  await browser.send('Page.enable')
  await browser.send('Runtime.enable')

  // The open session, planted before the application boots.
  await browser.goto('/reset-password', { settle: 600 })
  await browser.evaluate(
    `localStorage.setItem('sb-localhost-auth-token', ${JSON.stringify(
      JSON.stringify(session()),
    )}); 'listo'`,
  )

  const shots = [
    { file: 'artworks-mobile.png', path: '/', device: MOBILE },
    { file: 'record-mobile.png', path: '/artwork/AF-0001', device: MOBILE },
    {
      // The documentary block loads on demand — it is the heaviest part of the
      // record and the capture screen does not need it — so it is asked for and
      // then the chain is scrolled to.
      file: 'provenance-mobile.png',
      path: '/artwork/AF-0001',
      device: MOBILE,
      before: [`${clickText('Cargar la documentación')}; 'ok'`, `${clickText('Procedencia')}; 'ok'`],
      after: `${scrollToText('Procedencia')}; 'ok'`,
    },
    { file: 'photos-mobile.png', path: '/artwork/AF-0001/photos', device: MOBILE },
    { file: 'exhibitions-desktop.png', path: '/exhibitions', device: DESKTOP },
  ]

  for (const shot of shots) {
    console.log(shot.file)
    await browser.device(shot.device)
    await browser.goto(shot.path)
    for (const step of [shot.before ?? []].flat()) {
      await browser.evaluate(step)
      await sleep(1200)
    }
    if (shot.after) {
      await browser.evaluate(shot.after)
      await sleep(500)
    }
    await browser.shot(join(OUT, shot.file))
  }

  browser.close()
  server.close()

  if (unanswered.length > 0) {
    console.log('\nsin responder:', [...new Set(unanswered)].join(', '))
  }
}

await main()
