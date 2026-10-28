export async function boundedBody(request:Request,limit:number){
 if(Number(request.headers.get('content-length')||0)>limit)throw Error('Request is too large.');
 const reader=request.body?.getReader();if(!reader)return Buffer.alloc(0);
 const chunks:Uint8Array[]=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw Error('Request is too large.');}chunks.push(value);}}finally{reader.releaseLock();}
 return Buffer.concat(chunks,size);
}
