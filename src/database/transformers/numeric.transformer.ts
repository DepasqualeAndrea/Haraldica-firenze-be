export const NumericTransformer = {
  to: (value: any) => value,
  from: (value: any) => {
    if (value === null || value === undefined) return value;
    return typeof value === 'string' ? parseFloat(value) : value;
  },
};