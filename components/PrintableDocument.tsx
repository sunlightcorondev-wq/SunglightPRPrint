import React from 'react';
import { DocumentData, PrintSettings } from '../types';

interface PrintableDocumentProps {
  data: DocumentData;
  secondaryData?: DocumentData;
  settings?: PrintSettings;
}

const formatDate = (dateString: string): string => {
  if (!dateString) return "";
  const date = new Date(dateString);
  // Check if valid date
  if (isNaN(date.getTime())) return dateString;
  
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
};

const Receipt: React.FC<{ data: DocumentData; isDraft?: boolean }> = ({ data, isDraft = false }) => {
  // Logic to determine paper size
  // 10 items is the calibrated limit for Half A4 (148.5mm height)
  const ITEM_LIMIT_HALF_PAGE = 10;
  const isFullPage = data.items.length > ITEM_LIMIT_HALF_PAGE;
  const isManila = data.pr_for.toLowerCase() === 'manila';

  // Dimensions
  const dim = {
    width: '210mm',
    height: isFullPage ? '297mm' : '144mm' // Full A4 vs Half A4 (reduced to 144mm to account for printer margins)
  };

  // Determine minimum rows to fill the space aesthetically
  // 10 for Half A4, 25 for Full A4 (approximate to fill space without pushing footer off)
  const minRows = isFullPage ? 25 : ITEM_LIMIT_HALF_PAGE;
  const emptyRows = Math.max(0, minRows - data.items.length);

  return (
    <div 
      className={`relative box-border overflow-hidden bg-white text-black ${isDraft ? 'opacity-60 grayscale' : ''}`}
      style={{
        width: dim.width,
        height: dim.height,
        fontFamily: 'Arial, sans-serif',
        // Margins: Reduced to prevent cutoff when printing two on a page
        paddingTop: '1mm',
        paddingRight: '2.5mm',
        paddingBottom: '1mm',
        paddingLeft: '2.5mm',
        // Add a cut line at the bottom if it's the first copy AND it's a half-page form
        borderBottom: (!isDraft && !isFullPage) ? '1px dashed #9ca3af' : 'none' 
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

      {/* Header Container */}
      <div className="mb-1 shrink-0">
        
        {/* Top Section: Logo - ID - Title */}
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
           <div className="w-1/3 flex justify-center">
              <div className="bg-yellow-300 border-[2px] border-black px-2 py-1 text-center min-w-[120px] shadow-sm whitespace-nowrap">
                  <span className="font-bold text-base tracking-wider text-black">{data.id}</span>
              </div>
           </div>

           {/* Right: Title */}
           <div className="w-1/3 text-right pr-2">
              <h2 className="text-sm font-bold text-black leading-tight uppercase font-serif tracking-widest">
                {data.pr_for} REQUISITION<br/>FORM
              </h2>
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

      {/* Table */}
      <div className="border-[1.5px] border-black mb-1 shrink-0">
         <table className="w-full text-[9px] border-collapse">
            <thead>
               <tr className="text-center font-bold text-black">
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
               {data.items.map((item, idx) => {
                 const remarks = (item.remarks || "").toLowerCase();
                 const isPurchase = remarks.includes('purchase');
                 const isWarehouse = remarks.includes('warehouse');
                 
                 // Remove 'Purchase' and 'Warehouse' from displayed remarks
                 const displayRemarks = (item.remarks || "")
                    .replace(/purchase/gi, '')
                    .replace(/warehouse/gi, '')
                    .trim();

                 return (
                 <tr key={idx} className="h-[18px]">
                    <td className="border-r border-black border-b border-gray-400 px-1 font-bold uppercase truncate">{item.description}</td>
                    <td className="border-r border-black border-b border-gray-400 px-1"></td>
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
                        <div className="flex flex-col gap-[1px] text-[7px] leading-none pl-1">
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
               {/* Empty rows to fill layout */}
               {Array.from({ length: emptyRows }).map((_, idx) => (
                 <tr key={`empty-${idx}`} className="h-[18px]">
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
               
               {/* Grand Total Row */}
               <tr className="h-[18px] font-bold text-[10px]">
                   <td className="border-r border-black border-t border-black" colSpan={5}></td>
                   <td className="border-r border-black border-t border-black text-right px-1 bg-gray-200 text-black whitespace-nowrap">GRAND TOTAL</td>
                   <td className="border-r border-black border-t border-black text-right px-1 text-black">
                      {(() => {
                        const nonPurchaseTotal = data.items.reduce((sum, item) => {
                          const isPurchase = (item.remarks || "").toLowerCase().includes('purchase');
                          return isPurchase ? sum : sum + item.unitPrice;
                        }, 0);
                        return nonPurchaseTotal > 0 ? nonPurchaseTotal.toFixed(2) : "";
                      })()}
                   </td>
                   <td className="border-r border-black border-t border-black" colSpan={2}></td>
               </tr>
            </tbody>
         </table>
      </div>

      {/* Footer / Signatories */}
      <div className="mt-1 text-[9px] font-bold shrink-0 text-black">
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
         <div className="flex justify-center mt-0.5">
             <div className="w-1/3">
                <div className="mb-1 text-center">APPROVED BY:</div>
                <div className="border-b border-black w-full mb-0.5 text-center uppercase text-[10px] min-h-[15px]"></div>
                <div className="text-[8px] text-center w-full">RESIDENT MANAGER</div>
             </div>
         </div>
      </div>
      
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
  
  return (
    <div 
      id="printable-area" 
      className="mx-auto print:m-0"
    >
      {Array.from({ length: copies }).map((_, i) => (
        <div key={i} style={{ pageBreakAfter: i < copies - 1 ? 'always' : 'auto' }}>
          <Receipt data={data} isDraft={false} />
          {showDraft && <Receipt data={data} isDraft={true} />}
          {secondaryData && !showDraft && <Receipt data={secondaryData} isDraft={false} />}
          {secondaryData && showDraft && (
            <>
              <Receipt data={secondaryData} isDraft={false} />
              <Receipt data={secondaryData} isDraft={true} />
            </>
          )}
        </div>
      ))}
    </div>
  );
};

export default PrintableDocument;