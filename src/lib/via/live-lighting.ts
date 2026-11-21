/** Coalesce drag updates, apply volatile values, persist only on explicit commit. */
export class LiveLighting {
 private pending=new Map<string,number[]>()
 private timer:ReturnType<typeof setTimeout>|undefined
 private running:Promise<void>|undefined
 private disposed=false
 constructor(private send:(packet:number[])=>Promise<unknown>,private onError:(error:unknown)=>void,private delay=40){}
 update(key:string,packet:number[]){if(this.disposed)return;this.pending.set(key,packet);if(!this.timer)this.timer=setTimeout(()=>{this.timer=undefined;void this.flush().catch(this.onError)},this.delay)}
 async flush():Promise<void>{
  if(this.timer){clearTimeout(this.timer);this.timer=undefined}
  if(this.running){await this.running;if(this.pending.size)return this.flush();return}
  const run=async()=>{while(this.pending.size&&!this.disposed){const batch=[...this.pending.values()];this.pending.clear();for(const packet of batch){if(this.disposed)return;await this.send(packet)}}}
  this.running=run();try{await this.running}finally{this.running=undefined}
 }
 dispose(){this.disposed=true;if(this.timer)clearTimeout(this.timer);this.pending.clear()}
}
