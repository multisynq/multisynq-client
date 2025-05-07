import './style.css'
import typescriptLogo from '/typescript.svg'
import viteLogo from '/vite.svg'
import multisynqLogo from '/multisynq.svg'
import { setupCounter } from './counter.ts'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div>
    <a href="https://vitejs.dev" target="_blank">
      <img src="${viteLogo}" class="logo" alt="Vite logo" />
    </a>
    <a href="https://www.typescriptlang.org/" target="_blank">
      <img src="${typescriptLogo}" class="logo vanilla" alt="TypeScript logo" />
    </a>
    <a href="https://multisynq.io" target="_blank">
      <img src="${multisynqLogo}" class="logo" alt="Multisynq logo" />
    </a>
    <h1>Vite + TypeScript + Multisynq</h1>
    <div class="card">
      <button id="counter" type="button"></button>
    </div>
    <p class="read-the-docs">
      Click on the Vite, TypeScript, and Multisynq logos to learn more
    </p>
  </div>
`

setupCounter(document.querySelector<HTMLButtonElement>('#counter')!)
