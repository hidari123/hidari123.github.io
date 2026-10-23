/**
 * 错误边界
 *
 * 没有它的后果不是「某个组件坏了」，而是整页白屏：
 * React 在渲染期抛出未捕获异常时会卸载整棵组件树，DOM 被清空，
 * 页面上只剩 <body>。用户看到的就是一片白，没有任何提示。
 *
 * 这个博客上最容易踩的场景是动态 import 失败：
 * - AIChatPanel 懒加载 chunk 404（发版后旧 chunk 被清理）
 * - AIPage 拖的 ONNX wasm 在某些网络/浏览器下加载失败
 * 这些都是「首屏正常、点一下就白」，没有边界就是死路。
 *
 * 所以边界除了兜住异常，还要给一条能继续走的路：重试按钮，
 * 而不是只显示一句「出错了」。
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface Props {
  children: ReactNode;
  /** 出错时显示的标题。区分来源比统一一句「出错了」有用 */
  title?: string;
  /** 自定义降级 UI */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    const { children, title, fallback } = this.props;

    if (!error) return children;
    if (fallback) return fallback(error, this.reset);

    return (
      <div className="min-h-[16rem] flex flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center">
          <AlertTriangle className="w-7 h-7 text-amber-500" />
        </div>

        <div>
          <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-1">
            {title ?? "这块没能加载出来"}
          </h3>
          <p className="text-sm text-[var(--text-secondary)] max-w-sm">
            通常是网络抖动或者发版后旧文件被清理了。重试一次一般就好了。
          </p>
        </div>

        {/* 原始错误留在折叠里，方便真出问题时排查，但不打扰普通用户 */}
        <details className="text-xs text-[var(--text-secondary)] max-w-sm w-full">
          <summary className="cursor-pointer hover:text-[var(--text-primary)] transition-colors">
            查看错误详情
          </summary>
          <pre className="mt-2 p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] overflow-x-auto text-left whitespace-pre-wrap break-all">
            {error.message}
          </pre>
        </details>

        <button
          onClick={this.reset}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <RotateCcw className="w-4 h-4" />
          重试
        </button>
      </div>
    );
  }
}