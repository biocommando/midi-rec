const sawSynth = phase => phase * 2 - 1

const sineSynth = phase => Math.sin(2 * Math.PI * phase)

const createSubSynth = () => {
    let decay = 1, c = 0
    const decayFade = 1 - 2e-4
    return phase => {
        if (decay < 1e-5) return 0
        let out = sawSynth(phase)
        const f = decay / (Math.PI + decay)
        c = c + f * (out - c)
        out = c
        decay *= decayFade
        return out
    }
}

const noiseSynth = () => Math.random() * 2 - 1

class Voice {
    constructor(note, synth) {
        this.note = note
        this.phaseInc = 8.1757989 * Math.pow(2, note / 12) / sampleRate
        this.phase = 0
        if (synth === 'saw') {
            this.synth = sawSynth
        } else if (synth === 'sub') {
            this.synth = createSubSynth()
        } else if (synth === 'noise') {
            this.synth = noiseSynth
        } else {
            this.synth = sineSynth
        }
    }

    process() {
        this.phase += this.phaseInc
        if (this.phase >= 1) this.phase -= 1
        return this.synth(this.phase)
    }
}



class BasicSynth extends AudioWorkletProcessor {
    constructor() {
        super();
        this.voices = []
        this.port.onmessage = e => this.handlePortEvent(e.data)
        this.synth = 'sine'
        this.volume = 0.5
        this.limitVoices = 0
    }

    /* Message format:
        [type, ...parameters]
       Note on:
        [1, noteNum, (synthName)]
       Note off:
        [2, noteNum]
       Kill all:
        [3]
       Set synth:
        [4, synthName]
       Set volume:
        [5, volume0to1]
       Set voice limit:
        [6, limit]
        (0 = no limit)
       Set delay:
        [7, {time, feedback, mix}]
    */
    handlePortEvent(msg) {
        const [type, param, param2] = msg
        switch (type) {
            case 1:
                this.noteOn(param, param2)
                break;
            case 2:
                this.noteOff(param)
                break;
            case 3:
                this.killAll()
                break;
            case 4:
                this.synth = param
                break;
            case 5:
                this.volume = param
                break;
            case 6:
                this.limitVoices = param
                break;
            case 7:
                if (param) {
                    this.delay = {
                        buf: new Array(Math.floor(param.time * sampleRate)).fill(0),
                        feedback: param.feedback,
                        mix: param.mix,
                        idx: 0
                    }
                } else {
                    this.delay = null
                }
            default:
                break;
        }
    }

    noteOn(note, synthName) {
        const found = this.voices.find(v => v.note === note)
        if (!found) {
            this.voices.push(new Voice(note, synthName || this.synth))
            if (this.limitVoices && this.voices.length > this.limitVoices) {
                this.voices.splice(0, this.voices.length - this.limitVoices)
            }
        }
    }

    noteOff(note) {
        this.voices = this.voices.filter(v => v.note !== note)
    }

    killAll() {
        this.voices = []
    }

    process(inputs, outputDevices, parameters) {
        const dev1OutputChannels = outputDevices[0]
        const channel1LeftBuffer = dev1OutputChannels[0]

        for (let i = 0; i < channel1LeftBuffer.length; i++) {
            let out = 0
            this.voices.forEach(v => {
                out += v.process()
            })
            out *= this.volume

            if (this.delay) {
                this.delay.buf[this.delay.idx] = this.delay.buf[this.delay.idx] * this.delay.feedback + out
                this.delay.idx++
                if (this.delay.idx === this.delay.buf.length) this.delay.idx = 0
                out += this.delay.buf[this.delay.idx] * this.delay.mix
            }

            for (let j = 0; j < dev1OutputChannels.length; j++) {
                dev1OutputChannels[j][i] = out
            }
        }

        return true
    }
}

registerProcessor('BasicSynth', BasicSynth)