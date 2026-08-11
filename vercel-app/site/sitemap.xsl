<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:sm="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
  exclude-result-prefixes="sm image">
  <xsl:output method="html" version="1.0" encoding="UTF-8" indent="yes" doctype-system="about:legacy-compat"/>
  <xsl:template match="/">
    <html lang="es">
      <head>
        <meta charset="UTF-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <meta name="robots" content="noindex, follow"/>
        <title>XML Sitemap — The JKD Legacy Academy</title>
        <style>
          :root { --ink:#0f1720; --muted:#5b6b7a; --line:#e6ebf0; --accent:#b91c1c; --bg:#f7f9fb; --card:#ffffff; }
          * { box-sizing: border-box; }
          body { margin:0; background:var(--bg); color:var(--ink); font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; }
          .wrap { max-width:1040px; margin:0 auto; padding:32px 20px 64px; }
          header h1 { margin:0 0 6px; font-size:24px; letter-spacing:-.01em; }
          header p { margin:0; color:var(--muted); }
          header .meta { margin-top:14px; font-size:13px; color:var(--muted); }
          .card { margin-top:22px; background:var(--card); border:1px solid var(--line); border-radius:12px; overflow:hidden; box-shadow:0 1px 2px rgba(16,24,32,.04); }
          table { width:100%; border-collapse:collapse; }
          th, td { text-align:left; padding:12px 16px; border-bottom:1px solid var(--line); vertical-align:top; }
          th { background:#fbfdff; font-size:12px; text-transform:uppercase; letter-spacing:.04em; color:var(--muted); font-weight:600; }
          tr:last-child td { border-bottom:0; }
          tbody tr:hover { background:#fafcff; }
          td a { color:var(--accent); text-decoration:none; word-break:break-all; }
          td a:hover { text-decoration:underline; }
          .num { text-align:right; font-variant-numeric:tabular-nums; color:var(--muted); white-space:nowrap; }
          .date { color:var(--muted); white-space:nowrap; font-variant-numeric:tabular-nums; }
          footer { margin-top:18px; font-size:12.5px; color:var(--muted); }
          footer a { color:var(--accent); }
        </style>
      </head>
      <body>
        <div class="wrap">
          <header>
            <h1>XML Sitemap</h1>
            <p>The JKD Legacy Academy — Jeet Kune Do en Melbourne y Adelaide.</p>
          </header>
          <xsl:choose>
            <!-- Índice de sitemaps -->
            <xsl:when test="sm:sitemapindex">
              <p class="meta">Este índice contiene <strong><xsl:value-of select="count(sm:sitemapindex/sm:sitemap)"/></strong> sitemap(s).</p>
              <div class="card">
                <table>
                  <thead><tr><th>Sitemap</th><th>Última modificación</th></tr></thead>
                  <tbody>
                    <xsl:for-each select="sm:sitemapindex/sm:sitemap">
                      <tr>
                        <td><a href="{sm:loc}"><xsl:value-of select="sm:loc"/></a></td>
                        <td class="date"><xsl:value-of select="sm:lastmod"/></td>
                      </tr>
                    </xsl:for-each>
                  </tbody>
                </table>
              </div>
            </xsl:when>
            <!-- Sitemap de URLs -->
            <xsl:otherwise>
              <p class="meta">Este sitemap contiene <strong><xsl:value-of select="count(sm:urlset/sm:url)"/></strong> URL(s).</p>
              <div class="card">
                <table>
                  <thead><tr><th>URL</th><th>Imágenes</th><th>Última modificación</th></tr></thead>
                  <tbody>
                    <xsl:for-each select="sm:urlset/sm:url">
                      <tr>
                        <td><a href="{sm:loc}"><xsl:value-of select="sm:loc"/></a></td>
                        <td class="num"><xsl:value-of select="count(image:image)"/></td>
                        <td class="date"><xsl:value-of select="sm:lastmod"/></td>
                      </tr>
                    </xsl:for-each>
                  </tbody>
                </table>
              </div>
            </xsl:otherwise>
          </xsl:choose>
          <footer>
            Sitemap XML para buscadores. Más información en <a href="https://www.sitemaps.org/">sitemaps.org</a>.
          </footer>
        </div>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
