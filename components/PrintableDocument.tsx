import React from 'react';
import { DocumentData, OrderItem, PrintSettings } from '../types';

interface PrintableDocumentProps {
  data: DocumentData;
  secondaryData?: DocumentData;
  settings?: PrintSettings;
}

const formatDate = (dateString: string): string => {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
};

// Calibrated limits:
// - Up to 10 items fits comfortably on Half A4 (144mm height)
// - A single full A4 page (with signatories) holds up to 34 items
// - Non-last pages (no signatories) can hold and fill up to 46 rows
// - Last page (with signatories) holds up to 34 rows
export const ITEM_LIMIT_HALF_PAGE = 10;
export const MAX_ITEMS_LAST_PAGE = 34;
export const MAX_ITEMS_INTERMEDIATE_PAGE = 46;
export const ITEM_LIMIT_ONE_PAGE = MAX_ITEMS_LAST_PAGE;

export const splitItemsIntoPages = (items: OrderItem[]): OrderItem[][] => {
  if (items.length <= ITEM_LIMIT_HALF_PAGE) {
    return [items];
  }
  // Single full page (which is also the last page, so it has signatories)
  if (items.length <= MAX_ITEMS_LAST_PAGE) {
    return [items];
  }

  // Multi-page distribution:
  // Can it fit in 2 pages? (Page 1 up to 46 items + Page 2 up to 34 items = 80 items capacity)
  if (items.length <= (MAX_ITEMS_INTERMEDIATE_PAGE + MAX_ITEMS_LAST_PAGE)) {
    // 2 pages: Page 2 cannot exceed MAX_ITEMS_LAST_PAGE (34)
    const targetPage2 = Math.min(MAX_ITEMS_LAST_PAGE, Math.floor(items.length / 2));
    const page1Count = items.length - targetPage2;
    return [
      items.slice(0, page1Count),
      items.slice(page1Count)
    ];
  }

  // 3 or more pages:
  let totalPages = 2;
  while ((totalPages - 1) * MAX_ITEMS_INTERMEDIATE_PAGE + MAX_ITEMS_LAST_PAGE < items.length) {
    totalPages++;
  }

  const pages: OrderItem[][] = [];
  let remaining = [...items];
  
  for (let p = 0; p < totalPages; p++) {
    const isLast = (p === totalPages - 1);
    const maxForThisPage = isLast ? MAX_ITEMS_LAST_PAGE : MAX_ITEMS_INTERMEDIATE_PAGE;
    const pagesLeft = totalPages - p;
    const avgRemaining = Math.ceil(remaining.length / pagesLeft);
    const count = Math.min(maxForThisPage, avgRemaining);
    
    pages.push(remaining.slice(0, count));
    remaining = remaining.slice(count);
  }
  
  if (remaining.length > 0) {
    pages[pages.length - 1].push(...remaining);
  }

  return pages;
};

interface ReceiptProps {
  data: DocumentData;
  pageNumber: number;
  totalPages: number;
  pageItems: OrderItem[];
  allItems: OrderItem[];
  isDraft?: boolean;
}

const Receipt: React.FC<ReceiptProps> = ({ 
  data, 
  pageNumber, 
  totalPages, 
  pageItems, 
  allItems, 
  isDraft = false 
}) => {
  const isHalfPage = allItems.length <= ITEM_LIMIT_HALF_PAGE && totalPages === 1;
  const isManila = data.pr_for.toLowerCase() === 'manila';
  const isLastPage = pageNumber === totalPages;

  // Dimensions
  const dim = {
    width: '210mm',
    height: isHalfPage ? '144mm' : '297mm' // Full A4 vs Half A4
  };

  // Determine rows to render:
  // - Half page: 10 rows
  // - Non-last page (no signatories): 46 rows (fills the whole page down to the bottom)
  // - Last page (has signatories): 34 rows (fills down to signatories)
  const minRows = isHalfPage 
    ? ITEM_LIMIT_HALF_PAGE 
    : isLastPage 
      ? MAX_ITEMS_LAST_PAGE 
      : MAX_ITEMS_INTERMEDIATE_PAGE;

  const emptyRows = Math.max(0, minRows - pageItems.length);
  const rowHeightClass = isHalfPage ? "h-[18px]" : "h-[20px]";

  // Subtotal for current page (non-purchase items)
  const pageSubtotal = pageItems.reduce((sum, item) => {
    const isPurchase = (item.remarks || "").toLowerCase().includes('purchase');
    return isPurchase ? sum : sum + item.unitPrice;
  }, 0);

  // Overall grand total across all items
  const overallGrandTotal = allItems.reduce((sum, item) => {
    const isPurchase = (item.remarks || "").toLowerCase().includes('purchase');
    return isPurchase ? sum : sum + item.unitPrice;
  }, 0);

  return (
    <div 
      className={`relative box-border overflow-hidden bg-white text-black ${isDraft ? 'opacity-60 grayscale' : ''}`}
      style={{
        width: dim.width,
        height: dim.height,
        fontFamily: 'Arial, sans-serif',
        paddingTop: isHalfPage ? '1mm' : '2.5mm',
        paddingRight: '2.5mm',
        paddingBottom: isHalfPage ? '1mm' : '2.5mm',
        paddingLeft: '2.5mm',
        // Add a cut line at the bottom if it's the first copy AND it's a half-page form
        borderBottom: (!isDraft && isHalfPage) ? '1px dashed #9ca3af' : 'none' 
      }}
    >
      {/* Draft Watermark/Label */}
      {isDraft && (
        <div className="absolute bottom-32 left-1/2 -translate-x-1/2 z-0 pointer-events-none select-none flex flex-col items-center justify-center -rotate-12 w-full text-center">
          <div className="text-8xl font-black text-gray-100 uppercase tracking-widest leading-none">
            DRAFT
          </div>
          <div className="text-base font-bold text-black mt-4 uppercase tracking-wider opacity-80 border-2 border-black px-4 py-2 bg-white/50">
            Please make comments, revisions, and remarks here
          </div>
        </div>
      )}

      {/* Content Container (relative z-10 to sit above watermark) */}
      <div className="relative z-10 h-full flex flex-col">

        {/* Top Header Section */}
        <div className="mb-1 shrink-0">
          
          {/* Top Section: Logo - ID & Page - Title */}
          <div className="flex justify-between items-center mb-1 relative">
             
             {/* Left: Logo */}
             <div className="w-1/3 pl-2">
                <div className="inline-block text-center">
                  <h1 className="text-4xl text-gold-500 leading-[0.7]" style={{ fontFamily: 'Vivaldi, "Brush Script MT", cursive', textShadow: '0.5px 0.5px 0px rgba(0,0,0,0.1)' }}>
                    Sunlight
                  </h1>
                  <div className="text-[6px] tracking-[0.2em] font-bold text-black uppercase mt-1 w-full text-center" style={{ fontFamily: 'Arial, sans-serif' }}>
                    HOTEL, CORON
                  </div>
                </div>
             </div>

             {/* Center: ID Box */}
             <div className="w-1/3 flex flex-col items-center justify-center">
                <div className="bg-yellow-300 border-[2px] border-black px-2 py-1 text-center min-w-[120px] shadow-sm whitespace-nowrap">
                    <span className="font-bold text-base tracking-wider text-black">{data.id}</span>
                </div>
             </div>

             {/* Right: Title */}
             <div className="w-1/3 text-right pr-2">
                <h2 className="text-sm font-bold text-black leading-tight uppercase font-serif tracking-widest">
                  {data.pr_for} REQUISITION<br/>FORM
                </h2>
                {totalPages > 1 && (
                  <div className="text-[8px] font-bold text-maroon-800 tracking-wider mt-0.5">
                    PAGE {pageNumber} OF {totalPages}
                  </div>
                )}
             </div>
          </div>

          {/* Info Fields Row */}
          <div className="flex justify-between items-end gap-6 text-[10px]">
              {/* Left Column Fields */}
              <div className="w-1/2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1">
                  <span className="font-bold whitespace-nowrap pt-0.5 text-black">DEPARTMENT</span>
                  <div className="border-b border-black font-bold uppercase px-1 truncate text-black">{data.department}</div>
                  
                  <span className="font-bold whitespace-nowrap pt-0.5 text-black">PURPOSE</span>
                  <div className="border-b border-black px-1 truncate text-black">{data.purpose}</div>
              </div>

              {/* Right Column Fields */}
              <div className="w-1/2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1">
                  <span className="font-bold whitespace-nowrap text-right w-full pt-0.5 text-black">DATE</span>
                  <div className="border-b border-black px-1 text-center text-black">{formatDate(data.date)}</div>
                  
                  <span className="font-bold whitespace-nowrap text-right w-full pt-0.5 text-black">DELIVER ON</span>
                  <div className="border-b border-black px-1 text-center text-black">{formatDate(data.deliverOn)}</div>
              </div>
          </div>
        </div>

        {/* Table Area - flex-1 expands to utilize all vertical space down to the footer/signatories */}
        <div className="border-[1.5px] border-black my-1 flex-1 flex flex-col justify-between overflow-hidden">
           <table className="w-full text-[9px] border-collapse h-full">
              <thead>
                 <tr className={`text-center font-bold text-black ${isHalfPage ? 'h-[18px]' : 'h-[21px]'}`}>
                    <th className="border-r border-black border-b px-1 py-0.5 w-[30%]">PARTICULARS</th>
                    <th className="border-r border-black border-b px-1 py-0.5 w-[5%]">SOH</th>
                    <th className="border-r border-black border-b px-1 py-0.5 w-[8%]">QTY REQUEST</th>
                    <th className="border-r border-black border-b px-1 py-0.5 w-[5%]">UOM</th>
                    <th className="border-r border-black border-b px-1 py-0.5 w-[8%]">ACTUAL DEL.</th>
                    <th className="border-r border-black border-b px-1 py-0.5 w-[10%]">UNIT COST</th>
                    <th className="border-r border-black border-b px-1 py-0.5 w-[10%]">TOTAL</th>
                    <th className="border-r border-black border-b px-1 py-0.5 w-[14%]">{isManila ? '' : 'MODE OF PAYMENT'}</th>
                    <th className="border-b border-black px-1 py-0.5">REMARKS</th>
                 </tr>
              </thead>
              <tbody className="text-black">
                 {pageItems.map((item, idx) => {
                   const remarks = (item.remarks || "").toLowerCase();
                   const isPurchase = remarks.includes('purchase');
                   const isWarehouse = remarks.includes('warehouse');
                   
                   // Remove 'Purchase' and 'Warehouse' from displayed remarks
                   const displayRemarks = (item.remarks || "")
                      .replace(/purchase/gi, '')
                      .replace(/warehouse/gi, '')
                      .trim();

                   return (
                   <tr key={idx} className={rowHeightClass}>
                      <td className="border-r border-black border-b border-gray-400 px-1 font-bold uppercase truncate">{item.description}</td>
                      <td className="border-r border-black border-b border-gray-400 px-1 text-center font-bold">{item.soh}</td>
                      <td className="border-r border-black border-b border-gray-400 px-1 text-center font-bold">{item.quantity}</td>
                      <td className="border-r border-black border-b border-gray-400 px-1 text-center">{item.uom}</td>
                      <td className="border-r border-black border-b border-gray-400 px-1"></td>
                      <td className="border-r border-black border-b border-gray-400 px-1 text-right">
                          {!isPurchase && (item.quantity > 0 ? (item.unitPrice / item.quantity).toFixed(2) : '0.00')}
                      </td>
                      <td className="border-r border-black border-b border-gray-400 px-1 text-right font-bold">
                          {!isPurchase && item.unitPrice.toFixed(2)}
                      </td>
                      <td className="border-r border-black border-b border-gray-400 px-1">
                         {!isManila && (
                          <div className="flex flex-row items-center gap-2 text-[7px] leading-none pl-1">
                             {isWarehouse ? (
                               <div className="flex items-center gap-1">
                                   <div className="w-1.5 h-1.5 border border-black bg-black"></div> 
                                   WHRSE
                               </div>
                             ) : (
                               <>
                                   <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 border border-black"></div> CASH</div>
                                   <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 border border-black"></div> CREDIT</div>
                                   {!isPurchase && (
                                       <div className="flex items-center gap-1">
                                           <div className="w-1.5 h-1.5 border border-black"></div> 
                                           WHRSE
                                       </div>
                                   )}
                               </>
                             )}
                          </div>
                         )}
                      </td>
                      <td className="border-b border-gray-400 px-1 truncate">{displayRemarks}</td>
                   </tr>
                 )})}

                 {/* Empty rows to maintain uniform physical grid and utilize empty space */}
                 {Array.from({ length: emptyRows }).map((_, idx) => (
                   <tr key={`empty-${idx}`} className={rowHeightClass}>
                      <td className="border-r border-black border-b border-gray-400"></td>
                      <td className="border-r border-black border-b border-gray-400"></td>
                      <td className="border-r border-black border-b border-gray-400"></td>
                      <td className="border-r border-black border-b border-gray-400"></td>
                      <td className="border-r border-black border-b border-gray-400"></td>
                      <td className="border-r border-black border-b border-gray-400"></td>
                      <td className="border-r border-black border-b border-gray-400"></td>
                      <td className="border-r border-black border-b border-gray-400">
                          {!isManila && null}
                      </td>
                      <td className="border-b border-gray-400"></td>
                   </tr>
                 ))}
                 
                 {/* Table Bottom Row: Grand Total on last page, or Subtotal & Continuation Notice on earlier pages */}
                 {isLastPage ? (
                   <tr className={`${isHalfPage ? 'h-[18px]' : 'h-[21px]'} font-bold text-[10px]`}>
                       <td className="border-r border-black border-t border-black" colSpan={5}></td>
                       <td className="border-r border-black border-t border-black text-right px-1 bg-gray-200 text-black whitespace-nowrap">GRAND TOTAL</td>
                       <td className="border-r border-black border-t border-black text-right px-1 text-black">
                          {overallGrandTotal > 0 ? overallGrandTotal.toFixed(2) : ""}
                       </td>
                       <td className="border-r border-black border-t border-black text-center text-[8px] text-gray-600 font-semibold" colSpan={2}>
                          {totalPages > 1 ? `(Page ${pageNumber} of ${totalPages})` : ''}
                       </td>
                   </tr>
                 ) : (
                   <tr className={`${isHalfPage ? 'h-[18px]' : 'h-[21px]'} font-bold text-[10px]`}>
                       <td className="border-r border-black border-t border-black text-center text-[8px] font-bold tracking-wider text-maroon-900 bg-gray-50 uppercase" colSpan={5}>
                          *** CONTINUED ON PAGE {pageNumber + 1} ***
                       </td>
                       <td className="border-r border-black border-t border-black text-right px-1 bg-gray-200 text-black whitespace-nowrap text-[9px]">
                          SUBTOTAL (PG {pageNumber})
                       </td>
                       <td className="border-r border-black border-t border-black text-right px-1 text-black">
                          {pageSubtotal > 0 ? pageSubtotal.toFixed(2) : ""}
                       </td>
                       <td className="border-r border-black border-t border-black text-center text-[8px] font-bold text-maroon-800" colSpan={2}>
                          SEE PAGE {pageNumber + 1} &gt;&gt;
                       </td>
                   </tr>
                 )}
              </tbody>
           </table>
        </div>

        {/* Footer / Signatories Section */}
        {isLastPage ? (
          // ONLY the last page has the signatories!
          <div className="mt-auto text-[9px] font-bold shrink-0 text-black pt-1">
             {/* Top Signatories Grid */}
             <div className="grid grid-cols-2 gap-8 mb-1">
                {/* Left Column Signatories */}
                <div className="space-y-2">
                   <div>
                      <div className="mb-1">PREPARED BY:</div>
                      <div className="border-b border-black w-3/4 mb-0.5 text-center uppercase text-[10px] min-h-[15px]">{data.preparedBy}</div>
                      <div className="text-[8px] text-center w-3/4">REQUESTOR</div>
                   </div>
                   <div>
                      <div className="mb-1">NOTED BY:</div>
                      <div className="border-b border-black w-3/4 mb-0.5 text-center uppercase text-[10px] min-h-[15px]">{data.notedBy}</div>
                      <div className="text-[8px] text-center w-3/4">DEPARTMENT HEAD</div>
                   </div>
                </div>

                {/* Right Column Signatories */}
                <div className="space-y-2 flex flex-col items-end">
                   <div className="w-full flex flex-col items-end">
                      <div className="w-3/4 flex flex-col items-center">
                        <div className="w-full text-left mb-1">RECEIVED BY:</div>
                        <div className="border-b border-black w-full mb-0.5 text-center uppercase text-[10px] min-h-[15px]">JULIUS CORNELIA</div>
                        <div className="text-[8px] text-center w-full">PURCHASING SUPERVISOR</div>
                      </div>
                   </div>
                   
                   <div className="w-full flex flex-col items-end">
                      <div className="w-3/4 flex flex-col items-center">
                        <div className="w-full text-left mb-1">CHECKED BY:</div>
                        <div className="border-b border-black w-full mb-0.5 text-center uppercase text-[10px] min-h-[15px]">HANNAH JOANNA ROMERO</div>
                        <div className="text-[8px] text-center w-full">FINANCE SUPERVISOR</div>
                      </div>
                   </div>
                </div>
             </div>

             {/* Bottom Center Signatory (Approved By) */}
             <div className="flex flex-col items-center justify-center mt-0.5">
                 <div className="w-1/3">
                    <div className="mb-1 text-center">APPROVED BY:</div>
                    <div className="border-b border-black w-full mb-0.5 text-center uppercase text-[10px] min-h-[15px]">{data.approvedBy || "ANGELO LIZARES"}</div>
                    <div className="text-[8px] text-center w-full">RESIDENT MANAGER</div>
                 </div>
                 {totalPages > 1 && (
                   <div className="text-[7px] text-gray-500 font-normal tracking-wide text-center mt-0.5">
                      Page {pageNumber} of {totalPages} • Final Page
                   </div>
                 )}
             </div>
          </div>
        ) : (
          // Non-last page: NO signatories, clean continuation footer bar
          <div className="mt-auto shrink-0 text-black pt-1 pb-0.5">
            <div className="flex justify-between items-center text-[7.5px] font-bold text-gray-600 tracking-wider uppercase px-1 border-t border-gray-300 pt-0.5">
              <span>{data.id}</span>
              <span className="text-maroon-800">Page {pageNumber} of {totalPages} • Continued on next page (Signatures on Page {totalPages})</span>
              <span>{data.department}</span>
            </div>
          </div>
        )}
        
      </div>
    </div>
  );
};

const PrintableDocument: React.FC<PrintableDocumentProps> = ({ 
  data, 
  secondaryData,
  settings 
}) => {
  const copies = settings?.copies || 1;
  const showDraft = settings?.showDraft ?? true;

  const dataPages = splitItemsIntoPages(data.items);
  const secondaryPages = secondaryData ? splitItemsIntoPages(secondaryData.items) : [];

  const isHalfPage = data.items.length <= ITEM_LIMIT_HALF_PAGE;
  const totalPages = dataPages.length;

  return (
    <div 
      id="printable-area" 
      className="mx-auto print:m-0"
    >
      {Array.from({ length: copies }).map((_, copyIndex) => (
        <React.Fragment key={`copy-${copyIndex}`}>
          {isHalfPage ? (
            // Half-page layout: can pair original + draft or primary + secondary on single sheet
            <div 
              className="page-sheet-container print:m-0"
              style={{ 
                pageBreakAfter: copyIndex < copies - 1 ? 'always' : 'auto', 
                breakAfter: copyIndex < copies - 1 ? 'page' : 'auto' 
              }}
            >
              <Receipt 
                data={data} 
                pageNumber={1} 
                totalPages={1} 
                pageItems={dataPages[0]} 
                allItems={data.items} 
                isDraft={false} 
              />
              {showDraft && (
                <Receipt 
                  data={data} 
                  pageNumber={1} 
                  totalPages={1} 
                  pageItems={dataPages[0]} 
                  allItems={data.items} 
                  isDraft={true} 
                />
              )}
              {secondaryData && !showDraft && (
                <Receipt 
                  data={secondaryData} 
                  pageNumber={1} 
                  totalPages={1} 
                  pageItems={secondaryPages[0] || secondaryData.items} 
                  allItems={secondaryData.items} 
                  isDraft={false} 
                />
              )}
              {secondaryData && showDraft && (
                <>
                  <Receipt 
                    data={secondaryData} 
                    pageNumber={1} 
                    totalPages={1} 
                    pageItems={secondaryPages[0] || secondaryData.items} 
                    allItems={secondaryData.items} 
                    isDraft={false} 
                  />
                  <Receipt 
                    data={secondaryData} 
                    pageNumber={1} 
                    totalPages={1} 
                    pageItems={secondaryPages[0] || secondaryData.items} 
                    allItems={secondaryData.items} 
                    isDraft={true} 
                  />
                </>
              )}
            </div>
          ) : (
            // Full-page / Multi-page layout (exceeds 10 items)
            <>
              {/* Original Pages */}
              {dataPages.map((pageItems, pageIdx) => {
                const pageNumber = pageIdx + 1;
                const isLast = !showDraft && pageIdx === totalPages - 1 && copyIndex === copies - 1;
                return (
                  <div 
                    key={`orig-p${pageNumber}-c${copyIndex}`}
                    className="page-sheet-container print:m-0 mb-6 print:mb-0 shadow-2xl print:shadow-none"
                    style={{ 
                      pageBreakAfter: isLast ? 'auto' : 'always', 
                      breakAfter: isLast ? 'auto' : 'page' 
                    }}
                  >
                    <Receipt 
                      data={data} 
                      pageNumber={pageNumber} 
                      totalPages={totalPages} 
                      pageItems={pageItems} 
                      allItems={data.items} 
                      isDraft={false} 
                    />
                  </div>
                );
              })}

              {/* Draft Pages (if enabled) */}
              {showDraft && dataPages.map((pageItems, pageIdx) => {
                const pageNumber = pageIdx + 1;
                const isLast = pageIdx === totalPages - 1 && copyIndex === copies - 1;
                return (
                  <div 
                    key={`draft-p${pageNumber}-c${copyIndex}`}
                    className="page-sheet-container print:m-0 mb-6 print:mb-0 shadow-2xl print:shadow-none"
                    style={{ 
                      pageBreakAfter: isLast ? 'auto' : 'always', 
                      breakAfter: isLast ? 'auto' : 'page' 
                    }}
                  >
                    <Receipt 
                      data={data} 
                      pageNumber={pageNumber} 
                      totalPages={totalPages} 
                      pageItems={pageItems} 
                      allItems={data.items} 
                      isDraft={true} 
                    />
                  </div>
                );
              })}
            </>
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

export default PrintableDocument;
