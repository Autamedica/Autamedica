import { describe, it, expect, vi, beforeEach } from 'vitest';
import { communityService } from './community.service';
import * as communityAdapterModule from '@/lib/patients/lib/repos/community.adapter';

vi.mock('@/lib/patients/lib/repos/community.adapter', () => ({
  createCommunityAdapter: vi.fn(),
}));

describe('communityService', () => {
  const mockSupabase = {} as any;
  const mockContext = { userId: 'user-1', patientId: 'patient-1' };

  let mockRepo: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRepo = {
      listGroups: vi.fn().mockResolvedValue([]),
      listMemberships: vi.fn().mockResolvedValue([]),
      listPosts: vi.fn().mockResolvedValue([]),
      findGroupById: vi.fn(),
      ensureMembership: vi.fn().mockResolvedValue(undefined),
      resolveDisplayName: vi.fn().mockResolvedValue('Test User'),
      createPost: vi.fn(),
      findPostById: vi.fn(),
      upsertReaction: vi.fn().mockResolvedValue(undefined),
      createComment: vi.fn(),
      findCommentById: vi.fn(),
      upsertCommentReaction: vi.fn().mockResolvedValue(undefined),
      updatePost: vi.fn(),
      deletePost: vi.fn().mockResolvedValue(undefined),
      findDoctorSpecialty: vi.fn(),
    };
    (communityAdapterModule.createCommunityAdapter as any).mockReturnValue(mockRepo);
  });

  describe('createPost', () => {
    it('throws VALIDATION error if groupId is empty', async () => {
      await expect(
        communityService.createPost(mockSupabase, mockContext, {
          groupId: '   ',
          content: 'Hello',
        })
      ).rejects.toThrow('El grupo es obligatorio');
    });

    it('throws VALIDATION error if content is empty', async () => {
      await expect(
        communityService.createPost(mockSupabase, mockContext, {
          groupId: 'group-1',
          content: '   ',
        })
      ).rejects.toThrow('El contenido es obligatorio');
    });

    it('throws GROUP_NOT_FOUND error if group does not exist', async () => {
      mockRepo.findGroupById.mockResolvedValue(null);

      await expect(
        communityService.createPost(mockSupabase, mockContext, {
          groupId: 'group-1',
          content: 'Hello',
        })
      ).rejects.toThrow('Grupo no encontrado');
    });

    it('creates post successfully if all conditions are met', async () => {
      mockRepo.findGroupById.mockResolvedValue({ id: 'group-1', name: 'Test Group' });
      mockRepo.createPost.mockResolvedValue({ id: 'post-1' });

      const result = await communityService.createPost(mockSupabase, mockContext, {
        groupId: 'group-1',
        title: 'Test Title',
        content: 'Test content',
        anonymous: true,
        tags: ['tag1', 'tag2', ''],
      });

      expect(mockRepo.ensureMembership).toHaveBeenCalledWith(
        ['user-1', 'patient-1'],
        'group-1',
        'patient-1'
      );
      expect(mockRepo.createPost).toHaveBeenCalledWith({
        groupId: 'group-1',
        authorId: 'patient-1',
        authorDisplayName: 'Test User',
        title: 'Test Title',
        content: 'Test content',
        anonymous: true,
        tags: ['tag1', 'tag2'], // empty tag is filtered
      });
      expect(result).toEqual({ id: 'post-1' });
    });
  });

  describe('updatePost', () => {
    it('throws POST_NOT_FOUND if post does not exist', async () => {
      mockRepo.findPostById.mockResolvedValue(null);

      await expect(
        communityService.updatePost(mockSupabase, mockContext, 'post-1', {
          content: 'updated',
        })
      ).rejects.toThrow('Publicacion no encontrada');
    });

    it('throws FORBIDDEN if user is not the author', async () => {
      mockRepo.findPostById.mockResolvedValue({ id: 'post-1', author_id: 'other-user' });

      await expect(
        communityService.updatePost(mockSupabase, mockContext, 'post-1', {
          content: 'updated',
        })
      ).rejects.toThrow('No podes editar esta publicacion');
    });

    it('updates post if user is the author', async () => {
      mockRepo.findPostById.mockResolvedValue({ id: 'post-1', author_id: 'patient-1' });
      mockRepo.updatePost.mockResolvedValue({ id: 'post-1', content: 'updated' });

      const result = await communityService.updatePost(mockSupabase, mockContext, 'post-1', {
        content: 'updated',
      });

      expect(mockRepo.updatePost).toHaveBeenCalledWith('post-1', {
        title: undefined,
        content: 'updated',
        tags: undefined,
      });
      expect(result).toEqual({ id: 'post-1', content: 'updated' });
    });
  });

  describe('deletePost', () => {
    it('throws FORBIDDEN if user is not the author', async () => {
      mockRepo.findPostById.mockResolvedValue({ id: 'post-1', author_id: 'other-user' });

      await expect(
        communityService.deletePost(mockSupabase, mockContext, 'post-1')
      ).rejects.toThrow('No podes eliminar esta publicacion');
    });

    it('deletes post successfully', async () => {
      mockRepo.findPostById.mockResolvedValue({ id: 'post-1', author_id: 'patient-1' });

      await communityService.deletePost(mockSupabase, mockContext, 'post-1');
      expect(mockRepo.deletePost).toHaveBeenCalledWith('post-1');
    });
  });
});
