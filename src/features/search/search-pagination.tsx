import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import cardStyles from './game-card.module.css';

function pageRange(current: number, total: number): Array<number | '...'> {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const pages: Array<number | '...'> = [1];
  if (current > 3) pages.push('...');
  for (let page = Math.max(2, current - 1); page <= Math.min(total - 1, current + 1); page += 1) pages.push(page);
  if (current < total - 2) pages.push('...');
  pages.push(total);
  return pages;
}

interface SearchPaginationProps {
  currentPage: number;
  totalPages: number;
  setPage: (page: number) => void;
  t: (key: string) => string;
}

export function SearchPagination({ currentPage, totalPages, setPage, t }: SearchPaginationProps) {
  const [jumpValue, setJumpValue] = useState('');
  const handleJump = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const page = parseInt(jumpValue, 10);
      if (!Number.isNaN(page) && page >= 1 && page <= totalPages) {
        setPage(page);
        setJumpValue('');
      }
    }
  };

  if (totalPages <= 1) return <nav className={cardStyles.pagination} aria-label={t('page.navLabel')} />;

  return (
    <nav className={cardStyles.pagination} aria-label={t('page.navLabel')}>
      <div className={cardStyles.paginationStatus}>{t('page.status').replace('{page}', String(currentPage)).replace('{total}', String(totalPages))}</div>
      <div className={cardStyles.paginationControls}>
        <button className={cardStyles.pageBtn} type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>
          <ChevronLeft className="ui-icon" aria-hidden="true" />
          <span>{t('page.prev')}</span>
        </button>
        <div className={cardStyles.paginationCenter}>
          {pageRange(currentPage, totalPages).map((item, index) => (
            item === '...'
              ? <span className={cardStyles.pageEllipsis} key={`ellipsis-${index}`}>...</span>
              : (
                <button className={`${cardStyles.pageBtn}${item === currentPage ? ` ${cardStyles.pageBtnActive}` : ''}`} type="button" key={item} aria-current={item === currentPage ? 'page' : undefined} onClick={() => setPage(item)}>
                  {item}
                </button>
              )
          ))}
        </div>
        <button className={cardStyles.pageBtn} type="button" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>
          <span>{t('page.next')}</span>
          <ChevronRight className="ui-icon" aria-hidden="true" />
        </button>
      </div>
      <div className={cardStyles.pageJumpRow}>
        <label className={cardStyles.pageJumpLabel} htmlFor="page-jump-input">{t('page.jump')}</label>
        <input
          id="page-jump-input"
          type="number"
          min={1}
          max={totalPages}
          className={cardStyles.pageJumpInput}
          value={jumpValue}
          onChange={e => setJumpValue(e.target.value)}
          onKeyDown={handleJump}
        />
      </div>
    </nav>
  );
}
