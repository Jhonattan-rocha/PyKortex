/** Barra de redimensionamento arrastável (vertical = ajusta largura; horizontal = altura). */
export function Splitter({
  orientation,
  onDrag
}: {
  orientation: 'v' | 'h'
  onDrag: (delta: number) => void
}): JSX.Element {
  const onMouseDown = (e: React.MouseEvent): void => {
    e.preventDefault()
    let last = orientation === 'v' ? e.clientX : e.clientY
    const move = (ev: MouseEvent): void => {
      const cur = orientation === 'v' ? ev.clientX : ev.clientY
      onDrag(cur - last)
      last = cur
    }
    const up = (): void => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    document.body.style.cursor = orientation === 'v' ? 'col-resize' : 'row-resize'
    document.body.style.userSelect = 'none'
  }

  return <div className={`splitter splitter--${orientation}`} onMouseDown={onMouseDown} />
}
