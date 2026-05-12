import { HttpErrorResponse, HttpInterceptorFn } from "@angular/common/http";
import { inject } from "@angular/core";
import { catchError, from, switchMap, throwError } from "rxjs";
import { AuthService } from "./auth.service";

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);

  return from(auth.getValidIdToken()).pipe(
    switchMap((token) => {
      const authedReq = token
        ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
        : req;

      return next(authedReq).pipe(
        catchError((err: HttpErrorResponse) => {
          if (err.status !== 401 || !token) return throwError(() => err);

          return from(auth.forceRefresh()).pipe(
            switchMap((refreshed) => {
              if (!refreshed) {
                void auth.beginLogin();
                return throwError(() => err);
              }
              const retryReq = req.clone({ setHeaders: { Authorization: `Bearer ${refreshed}` } });
              return next(retryReq);
            })
          );
        })
      );
    })
  );
};
