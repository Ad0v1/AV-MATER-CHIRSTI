import { htmlText } from './report-text.js';
import {
  achievementText,
  averageLiteral,
  averageValue,
  cellValue,
  isLiteralReport,
  legendText,
  LOGO_MIMES,
  limaTimestamp,
  sectionText,
  type SectionReportData,
} from './section-report.js';

// HTML del registro para Gotenberg (RF-58, U4). Reglas:
//   - todo texto de la BD pasa por htmlText;
//   - sin <script>, sin manejadores on*, sin enlaces ni recursos externos: CSP default-src 'none'
//     y solo imágenes data: (el logo va embebido en base64, con MIME de lista blanca);
//   - estilos en línea en un <style> propio.

const CSP = "default-src 'none'; img-src data:; style-src 'unsafe-inline'";

const STYLE = `
@page { size: A4 landscape; margin: 12mm; }
* { box-sizing: border-box; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 10px; color: #111; margin: 0; }
header { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
header img { width: 56px; height: 56px; object-fit: contain; }
h1 { font-size: 15px; margin: 0 0 4px; }
dl { display: grid; grid-template-columns: auto 1fr auto 1fr; gap: 2px 10px; margin: 0; }
dt { font-weight: bold; }
dd { margin: 0; }
table { width: 100%; border-collapse: collapse; }
th, td { border: 1px solid #999; padding: 3px 4px; text-align: center; }
th { background: #e5e7eb; }
td.name, th.name { text-align: left; }
tr.risk td { background: #fde8e8; }
p.legend { margin-top: 8px; color: #333; }
`;

const h = htmlText;

function logoTag(data: SectionReportData): string {
  const logo = data.institution.logo;
  if (!logo || !(LOGO_MIMES as readonly string[]).includes(logo.mime)) return '';
  return `<img alt="Logo institucional" src="data:${logo.mime};base64,${logo.data.toString('base64')}">`;
}

const text = (v: number | string | null) => (v === null ? '—' : h(String(v)));

export function buildSectionHtml(data: SectionReportData): string {
  const literal = isLiteralReport(data);
  const heads = data.assignments.map((a) => `<th scope="col">${h(a.title)}</th>`).join('');
  const rows = data.students
    .map((s, i) => {
      const cells = s.cells.map((c) => `<td>${text(cellValue(c))}</td>`).join('');
      const name = s.isCurrent ? s.fullName : `${s.fullName} (retirado)`;
      return (
        `<tr${s.atRisk ? ' class="risk"' : ''}><td>${i + 1}</td>` +
        `<th scope="row" class="name">${h(name)}</th>${cells}` +
        (literal
          ? `<td>${h(achievementText(s.achievement))}</td>`
          : `<td>${text(averageValue(s.average))}</td><td>${h(averageLiteral(s.average))}</td>`) +
        `<td>${s.atRisk ? 'Sí' : 'No'}</td></tr>`
      );
    })
    .join('');
  const empty =
    data.students.length === 0
      ? `<tr><td colspan="${data.assignments.length + (literal ? 4 : 5)}">Sin estudiantes.</td></tr>`
      : '';
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<title>${h(`Registro - ${data.course} - ${data.period}`)}</title>
<style>${STYLE}</style>
</head>
<body>
<header>${logoTag(data)}<div>
<h1>${h(data.institution.name)}</h1>
<dl>
<dt>Curso</dt><dd>${h(data.course)}</dd>
<dt>Docente</dt><dd>${h(data.teacher ?? 'Sin docente asignado')}</dd>
<dt>Sección</dt><dd>${h(`${sectionText(data.level, data.gradeLevel, data.sectionCode)} (${data.year})`)}</dd>
<dt>Período</dt><dd>${h(data.period)}</dd>
<dt>Generado</dt><dd>${h(limaTimestamp(data.generatedAt))}</dd>
</dl>
</div></header>
<table>
<thead><tr><th scope="col">N.º</th><th scope="col" class="name">Estudiante</th>${heads}${literal ? '<th scope="col">Logro</th>' : '<th scope="col">Promedio</th><th scope="col">Literal</th>'}<th scope="col">En riesgo</th></tr></thead>
<tbody>${rows}${empty}</tbody>
</table>
<p class="legend">${h(legendText(data))}</p>
</body>
</html>
`;
}
