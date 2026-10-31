const TAILLE_BLOC = 1600;

class PcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.tampon = new Int16Array(TAILLE_BLOC);
    this.n = 0;
  }

  process(entrees) {
    const canal = entrees[0] && entrees[0][0];
    if (!canal) return true;

    for (let i = 0; i < canal.length; i += 1) {
      const s = Math.max(-1, Math.min(1, canal[i]));
      this.tampon[this.n] = s < 0 ? s * 0x8000 : s * 0x7fff;
      this.n += 1;
      if (this.n === TAILLE_BLOC) {
        this.port.postMessage(this.tampon.buffer, [this.tampon.buffer]);
        this.tampon = new Int16Array(TAILLE_BLOC);
        this.n = 0;
      }
    }
    return true;
  }
}

registerProcessor("pcm-processor", PcmProcessor);