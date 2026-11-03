import { Fragment } from 'react';
import { Area, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, XAxis, YAxis } from 'recharts';
import type { IncidentReport } from '@/types';
import { buildReportModel, REPORT_DISCLAIMER, type Block } from '@/services/incidentReport';
import { APP_FULL_NAME } from '@/content/content';
import { fmtDateTime } from '@/utils';

/** Formal report document (Georgia body, Trebuchet headings). Also used for print. */
export function ReportDocument({ report }: { report: IncidentReport }) {
  const sections = buildReportModel(report);
  return (
    <article className="report-doc report-print mx-auto max-w-[820px] rounded-md px-10 py-9 shadow-[0_1px_0_rgba(0,0,0,0.04)]">
      <header className="mb-6 border-b-2 border-[#13324a] pb-4">
        <p className="rp-meta uppercase tracking-wider">{APP_FULL_NAME}</p>
        <h1 className="mt-1 text-[24px] font-bold">Environmental Incident Investigation Report</h1>
        <p className="rp-meta mt-2">
          <code>{report.id}</code> · Incident <code>{report.incidentId}</code> · Version {report.version} ({report.status}) · Generated {fmtDateTime(report.generatedAt)}
        </p>
      </header>
      {sections.map((s) => (
        <section key={s.num} className="mb-6 break-inside-avoid-page">
          <h2 className="mb-2 border-b border-[#cfd8de] pb-1 text-[17px] font-bold">{s.num}. {s.title}</h2>
          {s.blocks.map((b, i) => <BlockView key={i} b={b} />)}
        </section>
      ))}
      <footer className="rp-note mt-8 border-t border-[#cfd8de] pt-3">{REPORT_DISCLAIMER}</footer>
    </article>
  );
}

function BlockView({ b }: { b: Block }) {
  switch (b.kind) {
    case 'para':
      return <p className="mb-2">{b.text}</p>;
    case 'note':
      return <p className="rp-note mb-2">{b.text}</p>;
    case 'list':
      return <ul className="mb-2 list-disc pl-6">{b.items.map((x, i) => <li key={i}>{x}</li>)}</ul>;
    case 'kv':
      return (
        <table>
          <tbody>
            {b.rows.map(([k, v]) => (
              <tr key={k}>
                <th className="w-[34%] !bg-[#f3f6f8]">{k}</th>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    case 'table':
      return (
        <Fragment>
          <div className="overflow-x-auto">
            <table>
              <thead><tr>{b.head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>{b.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
            </table>
          </div>
          {b.caption && <p className="rp-note -mt-1 mb-3">{b.caption}</p>}
        </Fragment>
      );
    case 'chart':
      return (
        <figure className="mb-3">
          <ComposedChart width={720} height={240} data={b.points} margin={{ top: 10, right: 16, bottom: 4, left: 0 }} style={{ maxWidth: '100%' }}>
            <CartesianGrid stroke="#e3e9ed" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#4b5a66' }} />
            <YAxis tick={{ fontSize: 11, fill: '#4b5a66' }} label={{ value: 'µg/m³', angle: -90, position: 'insideLeft', fontSize: 11, fill: '#4b5a66' }} />
            <Legend wrapperStyle={{ fontSize: 12, fontFamily: 'Arial' }} />
            <ReferenceLine y={60} stroke="#c8781e" strokeDasharray="4 3" label={{ value: 'PM2.5 limit 60', fontSize: 10, fill: '#c8781e', position: 'insideTopLeft' }} />
            <ReferenceLine y={100} stroke="#be3232" strokeDasharray="4 3" label={{ value: 'PM10 limit 100', fontSize: 10, fill: '#be3232', position: 'insideTopRight' }} />
            <Area dataKey="pm10" name="PM10 (24-h)" stroke="#874e2b" fill="#874e2b22" isAnimationActive={false} />
            <Line dataKey="pm25" name="PM2.5 (24-h)" stroke="#237acd" strokeWidth={2} dot isAnimationActive={false} />
          </ComposedChart>
          <figcaption className="rp-note">{b.caption}</figcaption>
        </figure>
      );
    case 'images':
      return (
        <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {b.items.map((img, i) => (
            <figure key={i}>
              <img src={img.url} alt={img.caption} className="aspect-[4/3] w-full rounded border border-[#dde4e8] object-cover" />
              <figcaption className="rp-note mt-1 !text-[11px]">{img.caption}</figcaption>
            </figure>
          ))}
        </div>
      );
  }
}
