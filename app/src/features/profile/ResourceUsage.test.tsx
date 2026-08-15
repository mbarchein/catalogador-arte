// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import { fireEvent } from '@testing-library/dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ResourceUsage } from './ResourceUsage'

/**
 * El espacio ocupado, y su botón de volver a medir (RF-1202).
 *
 * Lo que se fija aquí es lo que un icono sin rótulo se lleva por delante: **su nombre
 * accesible** y, en éste, algo más — el botón antes decía «Midiendo…» mientras medía, y un
 * dibujo no dice eso. Así que mientras mide gira, se desactiva y **lo cuenta en su
 * rótulo**; sin eso, volver a pulsar durante una medida que tarda —contar el archivo
 * recorre el listado del bucket entero— parecería que no pasa nada.
 */

/** Cuántas veces se ha pedido la medida, y cómo contesta. */
let medidas = 0
let soltar: (() => void) | null = null

vi.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: async () => {
      medidas += 1
      if (soltar !== null) await new Promise<void>((resolve) => (soltar = resolve))
      return {
        data: [{ database_bytes: 1_000_000, storage_bytes: 2_000_000, storage_objects: 12 }],
        error: null,
      }
    },
    functions: {
      invoke: async () => ({ data: { bytes: 3_000_000, objects: 4, truncated: false }, error: null }),
    },
  },
}))

beforeEach(() => {
  medidas = 0
  soltar = null
})

afterEach(() => {
  soltar = null
})

describe('volver a medir', () => {
  it('es un icono en la línea del título, y aun así tiene rótulo', async () => {
    render(<ResourceUsage />)

    const boton = await screen.findByRole('button', { name: 'Volver a medir' })
    expect(boton.textContent?.trim()).toBe('')
    expect(boton.querySelector('svg')).not.toBeNull()

    // En la línea del título y no al pie de las tres barras: es lo que se pidió, y es lo
    // que hace que no se lleve una línea entera de una tarjeta ya larga.
    const cabecera = boton.closest('div')
    expect(cabecera?.textContent).toContain('Espacio ocupado')
  })

  it('vuelve a pedir la medida', async () => {
    render(<ResourceUsage />)
    await waitFor(() => expect(medidas).toBe(1))

    fireEvent.click(await screen.findByRole('button', { name: 'Volver a medir' }))
    await waitFor(() => expect(medidas).toBe(2))
  })

  it('mientras mide lo dice y no se puede volver a pulsar', async () => {
    // La medida se deja colgada a propósito: es el estado que el dibujo no sabe contar por
    // sí solo, y el que antes tenía su propia palabra en el botón.
    soltar = () => {}

    render(<ResourceUsage />)

    const boton = await screen.findByRole('button', { name: 'Midiendo…' })
    expect(boton.hasAttribute('disabled')).toBe(true)
    expect(boton.getAttribute('aria-busy')).toBe('true')
    // Y gira, que es lo único que un icono puede decir sin palabras.
    expect(boton.querySelector('svg')?.getAttribute('class')).toContain('animate-spin')
  })
})
