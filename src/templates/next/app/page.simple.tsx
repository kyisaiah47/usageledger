import SimpleView, { SimpleMark } from '@/components/SimpleView';
import { flatQuery, loadLedger, parseWindow, shown } from '@/lib/ledger';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = flatQuery(await searchParams);
  const win = parseWindow(query);
  const ledger = await loadLedger(win);
  const { summary, example } = shown(ledger);
  return (
    <main>
      {ledger.error ? <p className="void error" role="alert">The ledger could not be read: {ledger.error}</p> : null}
      <SimpleView summary={summary} example={example} win={win} query={query} sink={ledger.sink} />
      <footer className="site-foot">
        <div className="brand"><SimpleMark size={18} /><span>UsageLedger</span></div>
      </footer>
    </main>
  );
}
