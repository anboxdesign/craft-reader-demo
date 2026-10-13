// One intentional wheel/trackpad gesture turns one page group, including its inertia.
export class WheelPager {
  reset(){this.last=-Infinity;this.fired=-Infinity;this.total=0;this.latched=false;this.direction=0;}
  constructor(){this.reset();}
  feed(delta,now){
    if(!Number.isFinite(delta)||Math.abs(delta)<.1)return 0;
    const direction=Math.sign(delta),pause=now-this.last>240;
    if(pause){this.total=0;this.latched=false;}
    this.last=now;
    if(this.direction&&direction!==this.direction){this.total=0;if(now-this.fired>400)this.latched=false;}
    this.direction=direction;
    if(this.latched||now-this.fired<400)return 0;
    this.total+=delta;
    if(Math.abs(this.total)<40)return 0;
    this.latched=true;this.fired=now;this.total=0;
    return direction;
  }
}
