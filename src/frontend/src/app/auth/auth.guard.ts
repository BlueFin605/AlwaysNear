import { inject } from "@angular/core";
import { CanActivateFn } from "@angular/router";
import { AuthService } from "./auth.service";

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const token = await auth.getValidIdToken();
  if (token) return true;
  await auth.beginLogin();
  return false;
};
