import ConsoleView from '@/components/ConsoleView';
import SimpleView from '@/components/SimpleView';
import ViewShell, { ViewToggle } from '@/components/ViewShell';
import { flatQuery, loadLedger, parseWindow, shown } from '@/lib/ledger';
import { href } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = flatQuery(await searchParams);
  const win = parseWindow(query);
  const view = query.view === 'simple' || query.view === 'console' ? query.view : null;
  const ledger = await loadLedger(win);
  const { summary, example } = shown(ledger);
  return (
    <main>
      {ledger.error ? <p className="void error" role="alert">The ledger could not be read: {ledger.error}</p> : null}
      <ViewShell
        initial={view ?? 'console'}
        fromUrl={view != null}
        console={<ConsoleView summary={summary} example={example} win={win} query={query} sink={ledger.sink} toggle={<ViewToggle />} />}
        simple={<SimpleView summary={summary} example={example} win={win} query={query} consoleHref={href(query, { view: 'console' })} sink={ledger.sink} toggle={<ViewToggle />} />}
      />
    </main>
  );
}
