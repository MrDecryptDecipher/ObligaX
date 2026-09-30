export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export class PaginationHelper {
  public static readonly DEFAULT_PAGE = 1;
  public static readonly DEFAULT_LIMIT = 50;
  public static readonly MAX_LIMIT = 500;

  public static sanitize(params?: PaginationParams): { page: number; limit: number; offset: number } {
    let page = Number(params?.page);
    let limit = Number(params?.limit);

    if (isNaN(page) || page < 1) {
      page = PaginationHelper.DEFAULT_PAGE;
    }

    if (isNaN(limit) || limit < 1) {
      limit = PaginationHelper.DEFAULT_LIMIT;
    } else if (limit > PaginationHelper.MAX_LIMIT) {
      limit = PaginationHelper.MAX_LIMIT;
    }

    const offset = (page - 1) * limit;
    return { page, limit, offset };
  }

  public static paginate<T>(data: T[], total: number, page: number, limit: number): PaginatedResult<T> {
    const totalPages = Math.ceil(total / limit) || 1;
    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    };
  }
}
