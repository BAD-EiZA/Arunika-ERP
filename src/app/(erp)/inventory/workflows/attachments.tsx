"use client";
import { useEffect, useState } from "react";
export function Attachments({ entityType, entityId, editable }: { entityType: string; entityId: string; editable: boolean }) {
 const [files, setFiles] = useState<{id:string; originalFilename:string|null}[]>([]), [error,setError]=useState("");
 const endpoint = `/api/erp/inventory/files?entityType=${entityType}&entityId=${entityId}`;
 async function load() { const r=await fetch(endpoint); const j=await r.json(); if(!r.ok) throw Error(j.error); setFiles(j.files); }
 useEffect(() => { fetch(endpoint).then(async r => { const j=await r.json(); if(!r.ok) throw Error(j.error); setFiles(j.files); }).catch(e=>setError(e.message)); },[endpoint]);
 async function upload(file: File) {
  try {
   setError(""); const r=await fetch("/api/erp/inventory/files/signature",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({entityType,entityId,filename:file.name,access:"authenticated"})}); const s=await r.json(); if(!r.ok) throw Error(s.error);
   const form=new FormData(); form.append("file",file); for(const [k,v] of Object.entries({ timestamp:s.timestamp, folder:s.folder, public_id:s.publicId, type:s.type, overwrite:"false", allowed_formats:s.allowedFormats, max_file_size:s.maxFileSize, context:s.context })) if(v!=null) form.append(k,String(v)); form.append("api_key",s.apiKey); form.append("signature",s.signature);
   const uploaded=await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(s.cloudName)}/image/upload`,{method:"POST",body:form}); const asset=await uploaded.json(); if(!uploaded.ok) throw Error("Unggah gagal");
   const done=await fetch("/api/erp/inventory/files/complete",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({fileId:s.fileId,publicId:asset.public_id,version:asset.version,signature:asset.signature})}); const result=await done.json(); if(!done.ok) throw Error(result.error); await load();
  } catch(e) {setError(e instanceof Error?e.message:"Gagal unggah");}
 }
 return <div className="my-2 border-t pt-2"><strong>Lampiran privat</strong>{error&&<p role="alert">{error}</p>}<ul>{files.map(f=><li key={f.id}><button type="button" className="underline" onClick={async()=>{try{const r=await fetch(`/api/erp/inventory/files/${f.id}/download`);const j=await r.json();if(!r.ok)throw Error(j.error);window.open(j.url,"_blank","noopener,noreferrer");}catch(e){setError(e instanceof Error?e.message:"Gagal");}}}>{f.originalFilename??f.id}</button></li>)}</ul>{editable&&<label>Unggah PDF/gambar<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e=>{const f=e.target.files?.[0];if(f)void upload(f);e.target.value="";}}/></label>}</div>;
}
