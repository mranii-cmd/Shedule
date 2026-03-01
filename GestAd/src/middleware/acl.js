// ACL middleware factory: check if the user has one of allowed roles
export function allowRoles(...allowed) {
  return function (req, res, next) {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'not authenticated' });
    if (allowed.includes(user.role)) return next();
    return res.status(403).json({ error: 'forbidden' });
  };
}