import { useRef, useState } from 'react'
import { prepareShot, validateFile, type PreparedShot } from '../../lib/images'
import { PlusIcon } from '../../components/ui'

/**
 * The three photo entry paths, without deciding what happens to them.
 *
 * Used from two places with different behaviors: in the capture flow photos
 * wait in a queue because the artwork does not exist yet, and in the record
 * page they upload right away because it does. What they share — camera, file
 * selection, drag and drop, validation and decoding — lives here so it is not
 * duplicated: two copies of this would end up accepting different things.
 */
export function PhotoInput({
  onPrepare,
  disabled,
  label = 'Fotografías',
  compact = false,
}: {
  onPrepare: (prepared: PreparedShot[]) => void
  disabled: boolean
  label?: string
  compact?: boolean
}) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const filesRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [preparing, setPreparing] = useState(0)

  async function process(list: FileList | File[] | null) {
    if (!list || disabled) return
    const files = Array.from(list)
    const newErrors: string[] = []
    setPreparing(files.length)

    const prepared: PreparedShot[] = []
    for (const file of files) {
      const problem = validateFile(file)
      if (problem) {
        newErrors.push(problem)
        setPreparing((n) => n - 1)
        continue
      }
      try {
        prepared.push(await prepareShot(file))
      } catch {
        // A file with an image extension but corrupt content lands here: the
        // browser cannot decode it.
        newErrors.push(`No se ha podido leer «${file.name}».`)
      }
      setPreparing((n) => n - 1)
    }

    setErrors(newErrors)
    setPreparing(0)
    if (prepared.length > 0) onPrepare(prepared)
  }

  return (
    <div>
      {!compact && <p className="label">{label}</p>}

      {/* The drop zone also wraps the buttons, so dropping anywhere on the
          block works. On the phone it is unused: the buttons are there. */}
      <div
        id="photo-zone"
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          void process(e.dataTransfer.files)
        }}
        className={`rounded-lg border-2 border-dashed p-3 transition ${
          dragging ? 'border-stone-800 bg-stone-100' : 'border-stone-300'
        }`}
      >
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => cameraRef.current?.click()}
            className="btn-secondary min-h-[3.25rem]"
          >
            <PlusIcon className="h-5 w-5" />
            Hacer foto
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => filesRef.current?.click()}
            className="btn-secondary min-h-[3.25rem]"
          >
            Elegir archivos
          </button>
        </div>

        <p className="mt-2 text-center text-xs text-stone-500">
          {dragging ? 'Suelta las fotos aquí' : 'O arrastra y suelta las fotos en este recuadro'}
        </p>

        {/* Two separate inputs: `capture` opens the camera directly and, when
            present, the browser ignores `multiple`. A single input would force
            choosing between direct camera and multiple selection. */}
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            void process(e.target.files)
            e.target.value = ''
          }}
        />
        <input
          ref={filesRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            void process(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {preparing > 0 && (
        <p role="status" className="mt-2 text-sm text-stone-600">
          Preparando {preparing} {preparing === 1 ? 'foto' : 'fotos'}…
        </p>
      )}

      {errors.length > 0 && (
        <ul
          role="alert"
          className="mt-2 space-y-1 rounded-lg bg-amber-50 p-2 text-xs text-amber-900"
        >
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
