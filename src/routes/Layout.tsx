import { jsxRenderer } from 'hono/jsx-renderer'
import { ViteClient, Link } from 'vite-ssr-components/hono'

export const layout = jsxRenderer(({ children, title }) => {
  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="theme-color" content="#0c1222" />
        <title>{title ?? 'Aíngel — Your Companion'}</title>
        <ViteClient />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&family=DM+Sans:ital,opsz,wght@0,9..40,300..700;1,9..40,300..700&display=swap" rel="stylesheet" />
        <script src="https://cdn.jsdelivr.net/npm/htmx.org@4.0.0-alpha6/dist/htmx.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/htmx.org@4.0.0-alpha6/dist/ext/hx-ws.js"></script>
        <script type="module" src="https://cdn.jsdelivr.net/gh/starfederation/datastar@1.0.0-RC.7/bundles/datastar.js"></script>
        <Link rel="stylesheet" href="/src/styles.css" />
      </head>
      <body>
        <div class="grain" />
        {children}
      </body>
    </html>
  )
})
