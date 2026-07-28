import { useRef, useState } from 'react'
import { prepareShot, validateFile, type PreparedShot } from '../../lib/images'
import { CameraIcon, ImageIcon } from '../../components/ui'

/** Which entry path produced the photos: the camera or the file selector. */
export type PhotoSource = 'camera' | 'files'

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
  onPrepare: (prepared: PreparedShot[], source: PhotoSource) => void
  disabled: boolean
  label?: string
  compact?: boolean
}) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const filesRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [preparing, setPreparing] = useState(0)

  async function process(list: FileList | File[] | null, source: PhotoSource) {
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
    if (prepared.length > 0) onPrepare(prepared, source)
  }

  return (
    <div>
      {!compact && <p className="label">{label}</p>}

      {/* The drop zone also wraps the buttons, so dropping anywhere on the
          block works. The dashed box and its hint only exist where there is a
          fine pointer to drag with: on a touch screen they were furniture
          promising a gesture the device does not make. */}
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
          void process(e.dataTransfer.files, 'files')
        }}
        className={`rounded-lg transition [@media(pointer:fine)]:border-2 [@media(pointer:fine)]:border-dashed [@media(pointer:fine)]:p-3 ${
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
            <CameraIcon className="h-5 w-5" />
            Hacer foto
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => filesRef.current?.click()}
            className="btn-secondary min-h-[3.25rem]"
          >
            <ImageIcon className="h-5 w-5" />
            Elegir archivos
          </button>
        </div>

        <p className="mt-2 hidden text-center text-xs text-stone-500 [@media(pointer:fine)]:block">
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
            void process(e.target.files, 'camera')
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
            void process(e.target.files, 'files')
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
