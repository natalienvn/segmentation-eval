export const metadata = {
  title: 'Segmentation Eval',
  description: 'Side-by-side prompt evaluation for JustAnswer / Fount routing',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body style={{ margin: 0, padding: 0, background: '#0a0c10' }}>
        {children}
      </body>
    </html>
  )
}
