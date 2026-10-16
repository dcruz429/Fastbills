type ModuleUser = {
  role: string;
  active?: boolean;
  guidelineModuleAccess?: boolean;
};

export function canEditGuidelineModules(user: ModuleUser | null | undefined): boolean {
  return !!user && user.active !== false && (user.role === "admin" || user.guidelineModuleAccess === true);
}
