import { Routes } from "@angular/router";
import { authGuard } from "./auth/auth.guard";

export const routes: Routes = [
  {
    path: "",
    loadComponent: () => import("./home/home.component").then((m) => m.HomeComponent),
    canActivate: [authGuard],
  },
  {
    path: "auth/callback",
    loadComponent: () => import("./auth/callback.component").then((m) => m.CallbackComponent),
  },
  {
    path: "role",
    loadComponent: () => import("./role-select/role-select.component").then((m) => m.RoleSelectComponent),
    canActivate: [authGuard],
  },
  {
    path: "patient",
    loadComponent: () => import("./patient/patient.component").then((m) => m.PatientComponent),
    canActivate: [authGuard],
  },
  {
    path: "carer",
    loadComponent: () => import("./carer/carer.component").then((m) => m.CarerComponent),
    canActivate: [authGuard],
  },
  { path: "**", redirectTo: "" },
];
