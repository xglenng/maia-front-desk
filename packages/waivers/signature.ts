import {z} from 'zod';
const point=z.object({x:z.number().finite().min(0).max(1),y:z.number().finite().min(0).max(1)}).strict();
export const drawnSignature=z.object({strokes:z.array(z.array(point).min(2).max(300)).min(1).max(80)}).strict().superRefine((value,ctx)=>{
 if(value.strokes.reduce((count,stroke)=>count+stroke.length,0)>2000)ctx.addIssue({code:'custom',message:'Signature is too detailed. Clear it and try again.'});
 const distance=value.strokes.reduce((total,stroke)=>total+stroke.slice(1).reduce((length,p,index)=>length+Math.hypot(p.x-stroke[index].x,p.y-stroke[index].y),0),0);
 if(distance<0.02)ctx.addIssue({code:'custom',message:'Draw your signature in the box.'});
});
export type DrawnSignature=z.infer<typeof drawnSignature>;
