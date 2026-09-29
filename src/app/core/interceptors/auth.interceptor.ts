import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // 対象がバックエンドAPIの場合のみ処理する
  const isApiUrl = req.url.startsWith(environment.apiUrl) || req.url.startsWith('/api');
  const isEmbedApiUrl =
    req.url.startsWith(environment.apiUrl + '/unauthApi') || req.url.startsWith('/unauthApi');
  if (isApiUrl && !isEmbedApiUrl) {
    // プロキシのセッションCookieをクロスドメインで送信する設定
    const clonedReq = req.clone({
      withCredentials: true,
    });
    return next(clonedReq).pipe(
      catchError((error: HttpErrorResponse) => {
        // 認証エラーのハンドリング
        if (error.status === 401 || error.status === 0) {
          console.warn('認証セッションがありません。ログインが必要です。');
          // PaaSプロキシにOAuthの画面遷移を処理させる。
          const redirectUrl = encodeURIComponent(window.location.href);
          window.location.href = environment.apiUrl + `/api/auth/login?redirect=${redirectUrl}`;
        }
        return throwError(() => error);
      }),
    );
  }

  return next(req);
};
