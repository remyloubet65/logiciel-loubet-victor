export function printHtml(html:string){
  const w = window.open('','_blank'); if(!w){ alert('Pop-up bloquée'); return }
  w.document.open(); w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body>'+html+'</body></html>'); w.document.close(); setTimeout(()=>{w.print(); w.close()},100)
}