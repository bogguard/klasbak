import { isOverdue, localDate, readerName, type ReaderAtDesk } from '@library/shared';
import { useEffect, useEffectEvent } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useConfig } from '../../lib/config';
import { formatDate, formatTimestampDate } from '../../lib/format';

/**
 * A slip for the pupil with the books they have and when each is due. Printed with the
 * browser, 72 mm wide: fits an 80 mm receipt printer and the top of an A4 page alike.
 * While it prints, the rest of the app is hidden (see `printing-ticket` in styles.css).
 */
export function LoanTicket({ desk, onDone }: { desk: ReaderAtDesk; onDone: () => void }) {
  const { t, i18n } = useTranslation();
  const { libraryName, logoKey } = useConfig();
  const { reader, activeLoans } = desk;
  const today = localDate();
  const loans = [...activeLoans].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  // Printing starts once per ticket, even if the parent passes a new callback while it renders.
  const done = useEffectEvent(onDone);

  useEffect(() => {
    const html = document.documentElement;
    const finish = () => {
      html.classList.remove('printing-ticket');
      done();
    };
    html.classList.add('printing-ticket');
    // Some browsers return from print() before printing; afterprint covers those.
    window.addEventListener('afterprint', finish, { once: true });
    // Wait a frame so the ticket (and the logo) is laid out before the print dialog opens.
    const frame = requestAnimationFrame(() => window.print());
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('afterprint', finish);
      html.classList.remove('printing-ticket');
    };
  }, []);

  return createPortal(
    <div className="loan-ticket hidden w-[72mm] bg-white p-[2mm] font-sans text-[10pt] leading-snug text-black print:block">
      <div className="flex items-center gap-[2mm] border-b border-black pb-[2mm]">
        {logoKey && <img src={`/${logoKey}`} alt="" className="h-[12mm] w-auto object-contain" />}
        <p className="font-display text-[13pt] font-semibold">{libraryName}</p>
      </div>

      <p className="mt-[3mm] text-[12pt] font-bold">{readerName(reader)}</p>
      {reader.group && <p>{reader.group}</p>}
      <p className="mt-[1mm] text-[9pt]">
        {t('ticket.printedOn', {
          date: formatTimestampDate(new Date().toISOString(), i18n.language),
        })}
      </p>

      <p className="mt-[3mm] font-semibold">{t('ticket.books', { count: loans.length })}</p>
      <ul className="mt-[1mm] space-y-[2mm]">
        {loans.map((loan) => (
          <li key={loan.id} className="border-l-2 border-black pl-[2mm]">
            <p className="font-semibold">{loan.titleTitle}</p>
            {isOverdue(loan, today) ? (
              <p className="font-bold">
                {t('ticket.late', { date: formatDate(loan.dueDate, i18n.language) })}
              </p>
            ) : (
              <p>{t('ticket.dueOn', { date: formatDate(loan.dueDate, i18n.language) })}</p>
            )}
          </li>
        ))}
      </ul>

      <p className="mt-[4mm] border-t border-dashed border-black pt-[2mm] text-center">
        {t('ticket.footer')}
      </p>
    </div>,
    document.body,
  );
}
