type PageHeadingProps = {
  eyebrow?: string
  title: string
  description: string
}

export function PageHeading({ eyebrow, title, description }: PageHeadingProps) {
  return (
    <header className="page-heading">
      {eyebrow ? <p className="page-heading__eyebrow">{eyebrow}</p> : null}
      <h1 className="page-heading__title">{title}</h1>
      <p className="page-heading__description">{description}</p>
    </header>
  )
}
