// RGB color picker ↔ firmware HSV; brightness remains an independent control.
export function hsvToHex(hue:number,saturation:number):string {
 const h=hue/255*6,s=saturation/255,c=s,x=c*(1-Math.abs(h%2-1)),m=1-c
 const rgb=h<1?[c,x,0]:h<2?[x,c,0]:h<3?[0,c,x]:h<4?[0,x,c]:h<5?[x,0,c]:[c,0,x]
 return '#'+rgb.map(n=>Math.round((n+m)*255).toString(16).padStart(2,'0')).join('')
}
export function hexToHsv(hex:string):{hue:number;saturation:number} {
 const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255),max=Math.max(...rgb),min=Math.min(...rgb),delta=max-min
 let hue=delta===0?0:max===rgb[0]?((rgb[1]-rgb[2])/delta)%6:max===rgb[1]?(rgb[2]-rgb[0])/delta+2:(rgb[0]-rgb[1])/delta+4
 if(hue<0)hue+=6
 return {hue:Math.round(hue/6*255),saturation:Math.round((max===0?0:delta/max)*255)}
}
