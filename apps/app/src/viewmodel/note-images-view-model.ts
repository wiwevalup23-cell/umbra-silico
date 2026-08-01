import type { ImportedImage } from '@/repository/contracts'
import type {
  ImageSourceResolver,
  NoteId,
  NoteImageListItem,
} from '@/shared/contracts'
import {
  createStaticLiveQuery,
  useLiveQuery,
  useOwnedLiveQuery,
} from '@/viewmodel/live-query-view-model'
import {
  useImageRepository,
  useImageSourceResolver,
} from '@/viewmodel/repository-hooks'

export type NoteImagesViewModel = {
  images: NoteImageListItem[]
  resolver: ImageSourceResolver | null
  importImage(noteId: NoteId, file: File): Promise<ImportedImage>
}

export function useNoteImagesViewModel(noteId: NoteId | null): NoteImagesViewModel {
  const imageRepository = useImageRepository()
  const resolver = useImageSourceResolver()
  const liveQuery = useOwnedLiveQuery(
    () =>
      noteId && imageRepository
        ? imageRepository.liveNoteImages(noteId)
        : createStaticLiveQuery<NoteImageListItem[]>([]),
    [imageRepository, noteId],
  )
  const images = useLiveQuery(liveQuery)

  return {
    images,
    resolver,
    async importImage(targetNoteId, file) {
      if (!imageRepository) {
        throw new Error('Images are unavailable in this build.')
      }

      return imageRepository.importImage({
        noteId: targetNoteId,
        file,
        fileName: file.name || null,
      })
    },
  }
}
