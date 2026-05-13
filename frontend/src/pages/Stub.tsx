import { useParams } from 'react-router'

export function Stub({ title, note }: { title: string; note?: string }) {
  return (
    <div className="max-w-5xl mx-auto px-4 py-10 flex flex-col gap-2">
      <h1 className="text-xl font-semibold text-neutral-100">{title}</h1>
      <p className="text-neutral-500 text-sm">
        {note ?? 'coming soon — this page is a placeholder.'}
      </p>
    </div>
  )
}

export function ParamStub({
  title,
  paramName,
}: {
  title: string
  paramName: string
}) {
  const params = useParams()
  return (
    <Stub
      title={title}
      note={`coming soon — ${paramName}: ${params[paramName] ?? '?'}`}
    />
  )
}
