import { Diff } from "./diff";

export interface ChangeSetParams {
    filePath?: string;
    content: string;
    diffs: Diff[];
}

export class ChangeSet {
    filePath?: string;
    content: string;
    diffs: Diff[];

    constructor(params: ChangeSetParams) {
        this.filePath = params.filePath;
        this.content = params.content;
        this.diffs = params.diffs;

        this._prepare();
    }

    /* @internal */
    _prepare() {
        this.diffs = this.diffs.sort((a, b) => {
            if (a.index !== b.index) {
                return a.index - b.index;
            }
            return a.tailIndex - b.tailIndex;
        });

        // VSCodeのLSPでworkspace/applyEditを送った時に重複した範囲があるとエラーになる
        // よって、重複する箇所のあるdiffを排除する必要がある
        //   1. 同じindexからスタート→検出文字数が長い方を優先（より複雑なルール
        this.diffs = this.diffs.filter((diff, idx) => {
            const next = this.diffs[idx + 1];
            if (!next) {
                return true;
            }
            if (diff.index === next.index && diff.tailIndex < next.tailIndex) {
                return false;
            }
            return true;
        });
        //   2. 異なるindexからスタート→indexが先の方を優先（先勝ち
        this.diffs = this.diffs.filter((diff, idx) => {
            const prev = this.diffs[idx - 1];
            if (!prev) {
                return true;
            }
            if (diff.index < prev.tailIndex) {
                return false;
            }
            return true;
        });
    }

    concat(other: ChangeSet): this {
        this.diffs = this.diffs.concat(other.diffs);
        this._prepare();
        return this;
    }

    applyChangeSets(str: string): string {
        this._prepare();

        let delta = 0;
        this.diffs.forEach(diff => {
            const applied = diff.apply(str, delta);
            if (applied == null) {
                return;
            }
            str = applied.replaced;
            delta = applied.newDelta;
        });

        return str;
    }

    subtract(subtrahend: ChangeSet): ChangeSet {
        this._prepare();
        subtrahend._prepare();

        const result: ChangeSet = new ChangeSet({
            filePath: this.filePath,
            content: this.content,
            diffs: this.diffs.map(v => v),
        });
        let m = 0;
        let s = 0;

        while (true) {
            const minuendDiff = result.diffs[m];
            const subtrahendDiff = subtrahend.diffs[s];

            if (!minuendDiff || !subtrahendDiff) {
                break;
            }
            if (!minuendDiff.isEncloser(subtrahendDiff) && minuendDiff.isCollide(subtrahendDiff)) {
                result.diffs.splice(m, 1);
                continue;
            }
            if (minuendDiff.isBefore(subtrahendDiff)) {
                m++;
            } else {
                s++;
            }
        }

        return result;
    }

    intersect(audit: ChangeSet): ChangeSet {
        this._prepare();
        audit._prepare();

        const result: ChangeSet = new ChangeSet({
            filePath: this.filePath,
            content: this.content,
            diffs: [],
        });
        let a = 0;
        let b = 0;

        while (true) {
            const baseDiff = this.diffs[a];
            const auditDiff = audit.diffs[b];
            if (!baseDiff || !auditDiff) {
                break;
            }
            if (baseDiff.isCollide(auditDiff) && result.diffs.indexOf(baseDiff) === -1) {
                result.diffs.push(baseDiff);
            }
            if (baseDiff.isBefore(auditDiff)) {
                a++;
            } else {
                b++;
            }
        }

        return result;
    }
}
