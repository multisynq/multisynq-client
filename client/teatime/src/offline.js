const LATENCY = 50;

export class OfflineSocket {
    constructor() {
        this.url = "(offline)";
        this.readyState = WebSocket.CONNECTING;
        this.bufferedAmount = 0;
        setTimeout(() => {
            this.readyState = WebSocket.OPEN;
            if (this.onopen) this.onopen();
        }, LATENCY);
        this.start = Date.now();
    }

    send(data) {
        const {id, action, args} = JSON.parse(data);
        switch (action) {
            case 'JOIN': {
                this.id = id;
                this.ticks = args.ticks.tick;
                this.seq = -16 >>> 0;
                this.reply('SYNC', { messages: [], time: this.time, seq: this.seq, tove: args.tove, reflector: "offline"});
                this.reply('RECV', [this.time, ++this.seq, {what: 'users', joined: [args.user], active: 1, total: 1}]);
                this.tick();
                return;
            }
            case 'SEND': {
                const msg = [...args];
                msg[0] = this.time;
                msg[1] = ++this.seq;
                this.reply('RECV', msg);
                return;
            }
            case 'PULSE':
                return;
            default: throw Error("Offline unhandled " + action);
        }
    }

    close(code, reason) {
        this.readyState = WebSocket.CLOSING;
        setTimeout(() => {
            this.readyState = WebSocket.CLOSED;
            if (this.onclose) this.onclose({code, reason});
        }, LATENCY);
    }

    get time() { return Date.now() - this.start; }

    tick() {
        clearInterval(this.ticker);
        this.ticker = setInterval(() => {
            this.reply('TICK', {time: this.time});
        }, this.ticks);
    }

    reply(action, args) {
        setTimeout(() => {
            if (this.onmessage) this.onmessage({
                data: JSON.stringify({id: this.id, action, args})
            });
        }, LATENCY);
    }
}
