/** Glob đơn giản cho đường dẫn: `**` mọi cấp, `*` trong một cấp, `?` một ký tự. Chuỗi trống/`**` khớp mọi đường dẫn. */
export function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === "*") {
      if (glob[i + 1] === "*") { re += ".*"; i++; if (glob[i + 1] === "/") i++; } else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`(^|/)${re}$`);
}

/** Danh sách glob (phân tách bằng dấu phẩy) có khớp một trong các file đổi không. Trống = luôn khớp. */
export function pathsMatch(paths: string, changed: string[]): boolean {
  const globs = paths.split(",").map((g) => g.trim()).filter(Boolean);
  if (globs.length === 0 || changed.length === 0) return true;
  return globs.some((g) => { const r = globToRegExp(g); return changed.some((f) => r.test(f)); });
}
